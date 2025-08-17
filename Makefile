.PHONY: all test clean update testclean distclean

files = api.js model.js parser.js authority.js characters.js
sources = $(addprefix src/, $(files))

## Actions

all: dist/spec-url.min.mjs dist/spec-url.browser.min.mjs

test: test/run/urltestdata.json
	@ echo ""
	@ node test/run-relative-tests.js
	@ echo ""
	@ node test/run-wpt-tests.js
	@ echo ""

clean: testclean distclean

## ES Module Bundle

dist/:
	@ mkdir dist/

distclean:
	@ test -d dist/ && echo "Removing dist/" && rm -r dist/ || exit 0

dist/spec-url.min.mjs: dist/ $(sources) Makefile
	@ echo "Making a minified ES module bundle"
	@ esbuild --bundle --format=esm --minify --keep-names src/api.js > dist/spec-url.min.mjs

dist/spec-url.browser.min.mjs: dist/ $(sources) Makefile
	@ echo "Making a minified browser bundle"
	@ echo "globalThis.SpecURLModule = import ('./src/api.js')" | esbuild --bundle --format=iife --minify --keep-names > dist/spec-url.browser.min.mjs


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

