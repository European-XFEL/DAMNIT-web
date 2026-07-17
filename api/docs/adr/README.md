# Architecture Decision Records

This directory records the key architecture and design decisions for the DAMNIT web API.

## Templates

Lightweight [MADR](https://adr.github.io/madr/)-style, based on the templates in `.templates/`. ADRs are living documents: they are updated as decisions evolve.

### Minimal

```md
{{ read_file("./docs/adr/.templates/adr-template-minimal.md") | wrap }}
```

### Full

```md
{{ read_file("./docs/adr/.templates/adr-template.md") | wrap }}
```

