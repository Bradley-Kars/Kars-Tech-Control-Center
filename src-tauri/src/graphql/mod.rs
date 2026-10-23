use anyhow::{Context, Result};
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;

pub struct GraphQLClient {
    client: Client,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLRequest {
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<Value>,
}

impl GraphQLClient {
    pub fn new(hostname: &str) -> Result<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Build HTTP client")?;
        Ok(Self {
            client,
            url: format!("https://{}/graphql", hostname),
        })
    }

    pub async fn query(&self, query: &str, api_key: Option<&str>) -> Result<Value> {
        let mut req = self
            .client
            .post(&self.url)
            .header("Content-Type", "application/json");
        if let Some(key) = api_key {
            req = req.header("x-api-key", key);
        }
        let body = GraphQLRequest {
            query: query.to_string(),
            variables: None,
        };
        let resp = req
            .json(&body)
            .send()
            .await
            .context("Send GraphQL request")?;
        let status = resp.status();
        let text = resp.text().await.context("Read response")?;
        if !status.is_success() {
            anyhow::bail!("GraphQL error {}: {}", status, &text[..text.len().min(500)]);
        }
        let json: Value = serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON: {}", &text[..text.len().min(500)]))?;
        if let Some(errors) = json.get("errors") {
            if let Some(arr) = errors.as_array() {
                if let Some(first) = arr.first() {
                    // Standard GraphQL: errors[0].message
                    let msg = first
                        .get("message")
                        .and_then(|m| m.as_str())
                        // Unraid format: errors[0].error.message
                        .or_else(|| first.pointer("/error/message").and_then(|m| m.as_str()))
                        .unwrap_or("unknown error");
                    anyhow::bail!("GraphQL: {}", msg);
                }
            }
        }
        Ok(json.get("data").cloned().unwrap_or(Value::Null))
    }

    pub async fn mutate(&self, mutation: &str, api_key: Option<&str>) -> Result<Value> {
        self.query(mutation, api_key).await
    }
}
