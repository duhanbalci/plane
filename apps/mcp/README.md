# Plane MCP server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server for Plane. MCP
clients — Claude Desktop, Cursor and the like — connect to `https://<your-plane>/mcp`, sign
in through Plane's own OAuth consent screen, and get tools for reading and changing work
items.

## How authorization works

This service is an OAuth 2.1 **resource server** only. Plane's API (`apps/api`, see
`plane/oauth/`) is the **authorization server**: it owns the login, the consent screen and
the tokens. Nothing here grants access.

```
Claude ──1── POST /mcp (no token)
       ◀─2── 401 + WWW-Authenticate: … resource_metadata="/.well-known/oauth-protected-resource/mcp"
       ──3── GET that document → { authorization_servers: ["https://plane.example.com"] }
       ──4── GET /.well-known/oauth-authorization-server → endpoints
       ──5── browser → /auth/o/authorize/ → Plane login → consent screen → code
       ──6── POST /auth/o/token/ (PKCE verifier) → access token
       ──7── POST /mcp with Bearer token → tools
```

On every request this service introspects the bearer token against
`/auth/o/introspect/` (cached briefly in Redis), checks the token carries `mcp:read`, and
checks its RFC 8707 audience is this server. It then **forwards the caller's own token** to
Plane's v1 API. Workspace and project permissions are therefore enforced exactly where they
always were; a token can never reach more than its owner already could.

## Tokens are workspace-agnostic

A token identifies a user, not a workspace. Every tool takes a `workspace_slug`, and
`list_workspaces` is the entry point that supplies it.

Scopes:

| Scope       | Grants                                                           |
| ----------- | ---------------------------------------------------------------- |
| `mcp:read`  | Every read. Required — a token without it is refused with `403`. |
| `mcp:write` | Creating and updating work items and comments.                   |

## Setup

### docker compose

1. Generate the credentials this service introspects with, on the API:

   ```bash
   docker compose exec api python manage.py create_mcp_resource_server_client
   ```

   Copy the two printed values into `.env` as `MCP_INTROSPECTION_CLIENT_ID` and
   `MCP_INTROSPECTION_CLIENT_SECRET`. The secret is hashed on save and is not shown again;
   `--rotate` issues a new one.

2. Set `APP_BASE_URL` to the public origin of the deployment. It has to match what browsers
   and MCP clients use, because it is the issuer identifier advertised in the discovery
   documents.

3. Bring the stack up. The proxy already routes `/mcp` and
   `/.well-known/oauth-protected-resource*` here.

4. Point a client at `https://<your-plane>/mcp`. Discovery and registration are automatic.

### Duploy

`duploy.toml` already declares the service and its routes. The credentials do not exist
until the API has run once, so the first deploy is a two-step:

```bash
# 1. Ship the new API (it runs the migrations that create the OAuth tables)
duploy deploy

# 2. Mint the resource server credentials inside the API container
duploy service exec api -- python manage.py create_mcp_resource_server_client

# 3. Store them, which is what the mcp service reads
duploy secret set mcp MCP_INTROSPECTION_CLIENT_ID=… MCP_INTROSPECTION_CLIENT_SECRET=…

# 4. Redeploy so mcp picks the secrets up
duploy deploy
```

Between steps 1 and 4 the `mcp` service fails its env validation on boot and stays
unhealthy. That is expected — nothing else is affected.

Rotating later is steps 2–4 again with `--rotate`.

### HTTPS is required

OAuth 2.1 permits plain HTTP only for loopback redirects. A Plane deployment served over
`http://` on a real hostname cannot be used from a remote MCP client.

## Environment

| Variable                          | Default            | Meaning                                                                                      |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `APP_BASE_URL`                    | —                  | Public origin of the deployment. Required.                                                   |
| `API_INTERNAL_URL`                | `http://api:8000`  | Where to reach the Plane API from inside the network.                                        |
| `MCP_BASE_PATH`                   | `/mcp`             | Path this server is mounted at.                                                              |
| `MCP_INTROSPECTION_CLIENT_ID`     | —                  | Confidential client id. Required.                                                            |
| `MCP_INTROSPECTION_CLIENT_SECRET` | —                  | Confidential client secret. Required.                                                        |
| `MCP_ALLOWED_HOSTS`               | empty              | Comma-separated hostnames for DNS rebinding protection. Leave unset behind a trusted proxy.  |
| `TOKEN_CACHE_TTL`                 | `45`               | Seconds a positive introspection may be reused. Caps how long a revoked token keeps working. |
| `REDIS_URL`                       | unset              | Shares the token cache across replicas. Without it the cache is per-process.                 |
| `API_TIMEOUT_MS`                  | `15000`            | Outbound request timeout to the Plane API.                                                   |
| `PORT` / `HOST`                   | `3000` / `0.0.0.0` | Bind address.                                                                                |

## Tools

| Tool                                                                                                                                | Scope       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `list_workspaces`, `get_current_user`, `list_workspace_members`                                                                     | `mcp:read`  |
| `list_projects`, `get_project`, `list_project_states`, `list_project_labels`, `list_project_members`, `list_cycles`, `list_modules` | `mcp:read`  |
| `list_work_items`, `get_work_item`, `search_work_items`, `list_work_item_comments`, `list_work_item_relations`                      | `mcp:read`  |
| `list_cycle_work_items`, `list_module_work_items`                                                                                   | `mcp:read`  |
| `create_work_item`, `update_work_item`, `add_work_item_comment`, `add_work_item_relation`, `remove_work_item_relation`              | `mcp:write` |
| `create_label`, `join_project`, `add_project_member`                                                                                | `mcp:write` |
| `create_cycle`, `update_cycle`, `remove_work_item_from_cycle`, `remove_work_item_from_module`                                       | `mcp:write` |
| `delete_work_item`, `delete_work_item_comment`                                                                                      | `mcp:write` |
| `list_wiki_collections`, `list_wiki_pages`, `get_wiki_page`                                                                         | `mcp:read`  |
| `create_wiki_collection`, `update_wiki_collection`, `delete_wiki_collection`                                                        | `mcp:write` |
| `create_wiki_page`, `update_wiki_page`, `update_wiki_page_content`, `move_wiki_page`, `archive_wiki_page`, `lock_wiki_page`         | `mcp:write` |
| `duplicate_wiki_page`, `delete_wiki_page`                                                                                           | `mcp:write` |

`create_work_item` and `update_work_item` also take `cycle_id`, `module_id` and `properties`.
Plane keeps all three outside the work item row, behind their own endpoints, so they run
after the create or update; if one fails, the work item is still saved and the result carries
a warning rather than an error, so a client does not retry and create the item twice.

Work item types and their custom properties come back from `get_project`, as `work_item_types`.
That is where `type_id` and the property ids in `properties` come from, and `get_work_item`
returns a typed item's values as `property_values`.

Project calls, reads included, need project membership, even for a workspace admin.
`join_project` adds the caller the way the web app's "Join project" does; `add_project_member`
adds someone else and needs a project admin.

The wiki tools use `/api/v1/workspaces/<slug>/wiki/`, which reuses the web app's wiki
permissions. A page body is written as HTML with `update_wiki_page_content`; the editor's
collaborative document is dropped and rebuilt from that HTML when the page is next opened,
so a session that has the page open at that moment can still overwrite the change.

`list_work_items` returns a compact set of fields without `description_html` unless `fields`
asks for more; `get_work_item` returns one item in full.

Every tool carries MCP behaviour annotations, so a client can confirm a deletion with the
user while letting reads through. The annotations are hints; the token's scope is what
actually gates a write.

## Revoking access

A user can see and revoke every application holding a grant on their account from
**Settings → Connected apps** in the web app. Revoking deletes the access tokens, refresh
tokens and any unredeemed authorization codes, so the client is cut off at once — save for
the resource server's token cache, which is why `TOKEN_CACHE_TTL` is short.

## Development

```bash
pnpm --filter mcp dev
pnpm --filter mcp test
```
