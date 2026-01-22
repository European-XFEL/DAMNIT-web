FROM site AS site
FROM demo AS demo
FROM app AS app

FROM nginx:stable-alpine AS frontend

COPY nginx/templates/default.frontend.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/proxy_api.conf /etc/nginx/proxy_api.conf

COPY --from=site /usr/src/app/apps/site/dist /usr/share/nginx/html/site
COPY --from=demo /usr/src/app/apps/demo/dist  /usr/share/nginx/html/demo
COPY --from=app /usr/src/app/apps/app/dist  /usr/share/nginx/html/app

HEALTHCHECK --interval=30s --timeout=3s \
CMD wget -qO- --no-check-certificate https://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
