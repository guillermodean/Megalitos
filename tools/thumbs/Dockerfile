FROM alpine:3.20
RUN apk add --no-cache vips-tools vips-heif libwebp-tools
ENTRYPOINT ["/bin/sh", "/make_thumbs_inner.sh"]
COPY make_thumbs_inner.sh /make_thumbs_inner.sh
