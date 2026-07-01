"""LDAP helpers for deployments that do not use OAuth."""

from pydantic import BaseModel, SecretStr

from ..shared.settings import LDAPSettings


class LDAPLogin(BaseModel):
    username: str
    password: SecretStr


def _build_tls(settings: LDAPSettings):
    """Build the ldap3 Tls config, or None to fall back to ldap3's own default."""
    import ssl

    from ldap3 import Tls

    if not settings.validate_cert:
        return Tls(validate=ssl.CERT_NONE)

    # ca_certs_file=None makes ldap3 fall back to the system trust store.
    return Tls(
        validate=ssl.CERT_REQUIRED,
        ca_certs_file=str(settings.ca_cert_file) if settings.ca_cert_file else None,
    )


def authenticate_ldap_user(settings: LDAPSettings, login: LDAPLogin) -> dict:
    """Authenticate a user with LDAP and return session-compatible user info."""
    if not settings.server_url:
        msg = "LDAP server is not configured"
        raise RuntimeError(msg)

    from ldap3 import ALL, AUTO_BIND_TLS_BEFORE_BIND, Connection, Server

    user_dn = _get_user_dn(settings, login.username)
    server = Server(
        settings.server_url,
        get_info=ALL,
        connect_timeout=settings.timeout,
        tls=_build_tls(settings),
    )
    connection = Connection(
        server,
        user=user_dn,
        password=login.password.get_secret_value(),
        auto_bind=AUTO_BIND_TLS_BEFORE_BIND if settings.start_tls else True,
        receive_timeout=settings.timeout,
    )

    try:
        attributes = [
            settings.display_name_attribute,
            settings.email_attribute,
            settings.family_name_attribute,
            settings.given_name_attribute,
            settings.groups_attribute,
        ]
        user_record = _search_user_record(
            settings, connection, login.username, attributes
        )
        return _user_info_from_record(settings, login.username, user_record)
    finally:
        connection.unbind()


def _get_user_dn(settings: LDAPSettings, username: str) -> str:
    """Return the DN used for the initial LDAP bind."""
    if settings.bind_dn_template:
        return settings.bind_dn_template.format(username=username)
    return username


def _search_user_record(
    settings: LDAPSettings,
    connection,
    username: str,
    attributes: list[str],
) -> dict:
    """Search LDAP for the bound user's attributes."""
    if not settings.user_search_base:
        return {}

    search_filter = settings.user_search_filter.format(username=username)
    found = connection.search(
        search_base=settings.user_search_base,
        search_filter=search_filter,
        attributes=attributes,
    )
    if not found or not connection.entries:
        return {}

    return connection.entries[0].entry_attributes_as_dict


def _first_value(record: dict, key: str, fallback: str = "") -> str:
    """Return the first LDAP attribute value as a string."""
    value = record.get(key, fallback)
    if isinstance(value, list):
        value = value[0] if value else fallback
    return str(value or fallback)


def _user_info_from_record(
    settings: LDAPSettings, username: str, record: dict
) -> dict[str, str | list[str]]:
    """Convert LDAP attributes into the session user shape used by DAMNIT-web."""
    name = _first_value(record, settings.display_name_attribute, username)
    email = _first_value(record, settings.email_attribute, f"{username}@localhost")
    family_name = _first_value(record, settings.family_name_attribute, "")
    given_name = _first_value(record, settings.given_name_attribute, username)
    groups = record.get(settings.groups_attribute, [])
    if not isinstance(groups, list):
        groups = [str(groups)]

    return {
        "email": email,
        "family_name": family_name,
        "given_name": given_name,
        "groups": [str(group) for group in groups],
        "name": name,
        "preferred_username": username,
        "sub": username,
    }
