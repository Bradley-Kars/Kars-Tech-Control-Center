"""KTS Master Control /kts/ endpoints integration tests (WS-2.19).

KTS domain: Customer 1:N Tickets, comments on tickets.
Hits the real backend against the real test DB. No fetch stubbing.
Self-contained: creates its own customers/tickets rather than relying on seed data.
"""

import pytest


@pytest.mark.asyncio
async def test_kts_list_customers(client):
    res = await client.get("/kts/customers")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_kts_create_customer(client):
    res = await client.post(
        "/kts/customers",
        json={
            "name": "Test Customer",
            "email": "test@example.com",
            "phone": "+1-555-0199",
            "company": "Test Co",
            "status": "active",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Test Customer"
    assert body["email"] == "test@example.com"
    assert "id" in body


@pytest.mark.asyncio
async def test_kts_get_customer(client):
    create = await client.post(
        "/kts/customers",
        json={
            "name": "Get Customer",
            "email": "get@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = create.json()["id"]
    res = await client.get(f"/kts/customers/{customer_id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == customer_id


@pytest.mark.asyncio
async def test_kts_update_customer(client):
    create = await client.post(
        "/kts/customers",
        json={
            "name": "Update Customer",
            "email": "update@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = create.json()["id"]
    res = await client.patch(
        f"/kts/customers/{customer_id}",
        json={"status": "inactive"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "inactive"


@pytest.mark.asyncio
async def test_kts_list_tickets(client):
    res = await client.get("/kts/tickets")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_kts_list_tickets_filter_by_status(client):
    # create a customer and an open ticket
    cust = await client.post(
        "/kts/customers",
        json={
            "name": "Filter Customer",
            "email": "filter@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = cust.json()["id"]
    await client.post(
        "/kts/tickets",
        json={
            "customer_id": customer_id,
            "title": "Open ticket",
            "description": "Open",
            "priority": "high",
            "status": "open",
        },
    )
    res = await client.get("/kts/tickets?status=open")
    assert res.status_code == 200, res.text
    body = res.json()
    assert all(t["status"] == "open" for t in body)


@pytest.mark.asyncio
async def test_kts_list_tickets_filter_by_customer(client):
    cust = await client.post(
        "/kts/customers",
        json={
            "name": "Filter Customer 2",
            "email": "filter2@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = cust.json()["id"]
    await client.post(
        "/kts/tickets",
        json={
            "customer_id": customer_id,
            "title": "Customer ticket",
            "description": "For customer filter",
            "priority": "medium",
        },
    )
    res = await client.get(f"/kts/tickets?customer_id={customer_id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert all(t["customer_id"] == customer_id for t in body)


@pytest.mark.asyncio
async def test_kts_create_ticket(client):
    cust = await client.post(
        "/kts/customers",
        json={
            "name": "Ticket Customer",
            "email": "ticket@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = cust.json()["id"]
    res = await client.post(
        "/kts/tickets",
        json={
            "customer_id": customer_id,
            "title": "New API test ticket",
            "description": "Created via API test",
            "priority": "high",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["title"] == "New API test ticket"
    assert body["customer_id"] == customer_id


@pytest.mark.asyncio
async def test_kts_get_ticket(client):
    cust = await client.post(
        "/kts/customers",
        json={
            "name": "Get Ticket Customer",
            "email": "getticket@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = cust.json()["id"]
    t = await client.post(
        "/kts/tickets",
        json={
            "customer_id": customer_id,
            "title": "Ticket to get",
            "description": "Fetch me",
            "priority": "low",
        },
    )
    ticket_id = t.json()["id"]
    res = await client.get(f"/kts/tickets/{ticket_id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == ticket_id
    assert "customer" in body
    assert "comments" in body


@pytest.mark.asyncio
async def test_kts_update_ticket(client):
    cust = await client.post(
        "/kts/customers",
        json={
            "name": "Update Ticket Customer",
            "email": "updateticket@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = cust.json()["id"]
    t = await client.post(
        "/kts/tickets",
        json={
            "customer_id": customer_id,
            "title": "Ticket to update",
            "description": "Update me",
            "priority": "low",
        },
    )
    ticket_id = t.json()["id"]
    res = await client.patch(
        f"/kts/tickets/{ticket_id}",
        json={"status": "resolved"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "resolved"
    assert body["resolved_at"] is not None


@pytest.mark.asyncio
async def test_kts_list_comments(client):
    cust = await client.post(
        "/kts/customers",
        json={
            "name": "Comment Customer",
            "email": "comment@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = cust.json()["id"]
    t = await client.post(
        "/kts/tickets",
        json={
            "customer_id": customer_id,
            "title": "Ticket for comments",
            "description": "Comment test",
            "priority": "medium",
        },
    )
    ticket_id = t.json()["id"]
    res = await client.get(f"/kts/tickets/{ticket_id}/comments")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_kts_create_comment(client):
    cust = await client.post(
        "/kts/customers",
        json={
            "name": "Comment Create Customer",
            "email": "commentcreate@example.com",
            "phone": None,
            "company": None,
            "status": "active",
        },
    )
    customer_id = cust.json()["id"]
    t = await client.post(
        "/kts/tickets",
        json={
            "customer_id": customer_id,
            "title": "Ticket for comment create",
            "description": "Comment create test",
            "priority": "medium",
        },
    )
    ticket_id = t.json()["id"]
    res = await client.post(
        f"/kts/tickets/{ticket_id}/comments",
        json={"author": "test-agent", "body": "API test comment"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["author"] == "test-agent"
    assert body["body"] == "API test comment"


@pytest.mark.asyncio
async def test_kts_auth_login(client):
    res = await client.post(
        "/kts/auth/login", json={"email": "agent@kts.local", "password": "secret"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "token" in body
    assert "user" in body


@pytest.mark.asyncio
async def test_kts_auth_logout(client):
    res = await client.post("/kts/auth/logout")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_kts_auth_me(client):
    res = await client.get("/kts/auth/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["role"] == "agent"
