.PHONY: all test clean update testclean distclean

files = host.mjs index.mjs pct.mjs
sources = $(addprefix src/, $(files))

## Actions

all: dist/spec-url.mjs dist/spec-url.js

test: test/run/urltestdata.json
	@ echo ""
	@ node test/run.mjs
	@ echo ""

clean: testclean distclean

## ES Module Bundle

dist/:
	@ mkdir dist/

dist/spec-url.js: dist/ $(sources) Makefile
	@ echo "Making a minified CommonJS bundle"
	@ esbuild --bundle --platform=node --minify --keep-names src/index.mjs > dist/spec-url.js

dist/spec-url.mjs: dist/ $(sources) Makefile
	@ echo "Making a minified ES Module"
	@ esbuild --bundle --format=esm --minify --keep-names src/index.mjs > dist/spec-url.mjs

distclean:
	@ test -d dist/ && echo "Removing dist/" && rm -r dist/ || exit 0

## Tests

update: testclean test/run/urltestdata.json

test/run/:
	@ mkdir test/run/

test/run/urltestdata.json: test/run/
	@ echo "\nGet latest web platform URL tests"
	@ echo "==================================\n"
	@ curl https://raw.githubusercontent.com/web-platform-tests/wpt/master/url/resources/urltestdata.json > test/run/urltestdata.json

testclean:
	@ test -d test/run/ && echo "Removing test/run/" && rm -r test/run/ || exit 0

