# Security

Authentication is handled by an external OAuth client, with authorization handled by queries made to MyMdC using the authenticated users information.

## Description

The API server uses a secure/private OAuth2 client to redirect users to the OAuth2 provider's login page. After the user logs in and is redirected back, their

Users log in via the 3rd party OAuth provider (in our case EuXFEL's Keycloak realm), following the standard OAuth 2 flow.

On redirect, their token is stored in a session cookie, which is available to the API code via the [Starlette Session Middleware](https://www.starlette.dev/middleware/#sessionmiddleware).

The user information stored in this token contains the users username in a field `preferred_username` (e.g. `roscar`).

This username is used to query MyMdC's user information endpoints to find out what proposals the user has access to.

Function calls/dependencies are set up such that any endpoint which requires access to data that needs authorization checks will always call a function ([`get_proposal_meta`][damnit_api.metadata.services.get_proposal_meta]) that verifies the user is allowed to view that resource.
