.PHONY: all test clean update testclean distclean

files = host.js index.js pct.js
sources = $(addprefix src/, $(files))

## Actions

all: dist/urllib.min.js

test: test/run/urltestdata.json
	@ echo ""
	@ deno run --allow-read="test/run/urltestdata.json" test/run.js
	@ echo ""

clean: testclean distclean

## ES Module Bundle

dist/:
	@ mkdir dist/

dist/urllib.min.js: dist/ $(sources)
	@ echo "Making a minified ES module bundle"
	@ esbuild --bundle --format=esm --minify src/index.js > dist/specurl.min.js

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

