//! Guards against the silent-failure bug class found in the W6 audit
//! (2026-10-10): 29 functions were annotated `#[tauri::command]` and had
//! frontend `invoke()` wrappers, but were never listed in the
//! `tauri::generate_handler![...]` array in src/main.rs. Everything compiled,
//! lint passed and tests were green — the calls only failed at runtime with
//! "command not found".
//!
//! This test parses the real sources and asserts that
//! declared `#[tauri::command]` functions == registered handler entries.
//!
//! Run: cargo test --test handler_parity

use std::fs;
use std::path::{Path, PathBuf};

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// Collect every function annotated with `#[tauri::command]` (with or without
/// attribute arguments) from all Rust sources under src/.
fn declared_commands(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![root.join("src")];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).expect("read_dir") {
            let path = entry.expect("entry").path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("rs") {
                continue;
            }
            let src = fs::read_to_string(&path).expect("read source");
            for (idx, line) in src.lines().enumerate() {
                let trimmed = line.trim();
                let is_attr = trimmed == "#[tauri::command]"
                    || (trimmed.starts_with("#[tauri::command(") && trimmed.ends_with(")]"));
                if !is_attr {
                    continue;
                }
                // The fn may be on this line or within the next few lines
                // (doc comments / other attributes in between).
                let window = src.lines().skip(idx).take(6).collect::<Vec<_>>().join("\n");
                let flat: String = window
                    .split('\n')
                    .filter(|l| {
                        let t = l.trim();
                        !t.starts_with("//") && !t.starts_with('#')
                    })
                    .collect::<Vec<_>>()
                    .join(" ");
                if let Some(pos) = flat.find("fn ") {
                    let rest = &flat[pos + 3..];
                    let name: String = rest
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect();
                    assert!(!name.is_empty(), "empty fn name near: {window}");
                    out.push(name);
                }
            }
        }
    }
    out
}

/// Collect registered entries from the tauri::generate_handler![...] array in
/// src/main.rs (last path segment = command name, e.g.
/// `commands::terminal::terminal_open` -> `terminal_open`).
fn registered_commands(root: &Path) -> Vec<String> {
    let src = fs::read_to_string(root.join("src/main.rs")).expect("read main.rs");
    let start = src
        .find("generate_handler![")
        .expect("main.rs must contain tauri::generate_handler![");
    let bracket = src[start..].find('[').expect("opening bracket") + start;
    // Walk to the matching closing bracket (entries contain no brackets).
    let mut depth = 0usize;
    let mut end = bracket;
    for (i, ch) in src[bracket..].char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    end = bracket + i;
                    break;
                }
            }
            _ => {}
        }
    }
    let block = &src[bracket + 1..end];
    // Strip line comments FIRST: comments may contain commas, which would
    // otherwise split an entry in half.
    let cleaned: String = block
        .lines()
        .map(|line| match line.find("//") {
            Some(pos) => {
                let mut l = line[..pos].to_string();
                l.push('\n');
                l
            }
            None => {
                let mut l = line.to_string();
                l.push('\n');
                l
            }
        })
        .collect();
    cleaned
        .split(',')
        .filter_map(|entry| {
            let e = entry.trim();
            if !e.contains("commands::") {
                return None;
            }
            Some(e.split("::").last().unwrap().trim().to_string())
        })
        .filter(|name| !name.is_empty())
        .collect()
}

#[test]
fn every_declared_command_is_registered() {
    let root = manifest_dir();
    let mut declared = declared_commands(&root);
    let mut registered = registered_commands(&root);
    declared.sort();
    declared.dedup();
    registered.sort();
    registered.dedup();

    let missing: Vec<_> = declared
        .iter()
        .filter(|n| !registered.contains(n))
        .cloned()
        .collect();
    let phantom: Vec<_> = registered
        .iter()
        .filter(|n| !declared.contains(n))
        .cloned()
        .collect();

    assert!(
        missing.is_empty(),
        "\nThese #[tauri::command] functions are NOT registered in \
         tauri::generate_handler![...] (src/main.rs) — frontend invoke() calls \
         for them fail at runtime with 'command not found':\n  {missing:#?}\n"
    );
    assert!(
        phantom.is_empty(),
        "\nHandler registers commands with no #[tauri::command] function:\n  {phantom:#?}\n"
    );
}
