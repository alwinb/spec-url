.PHONY: all test clean update testclean distclean

files = index.js auth.js host.js pct.js
sources = $(addprefix src/, $(files))

## Actions

all: dist/spec-url.min.js

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

dist/spec-url.min.js: dist/ $(sources)
	@ echo "Making a minified ES module bundle"
	@ esbuild --bundle --format=esm --minify src/index.js > dist/spec-url.min.js

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

