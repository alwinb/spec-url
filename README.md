URLReference
============
[![NPM badge]][spec-url on NPM]  

_URL or relative reference._  
The `URLReference` class is designed to overcome shortcomings of the `URL` class.

#### Reference Implementation

This project provides an URL manipulation API that supports **relative URLs**
in a way that is compatible with the [WHATWG URL Standard].

The project also serves as a reference implementation for a new [URL Specification]. 
The WHATWG Standard has not been written with the use case of relative
URLs in mind and it does not provide the necessary infrastructure to add support for it.
Therefore I have seen no other way forward than to provide a new URL specification that
rephrases and generalises the WHATWG URL Standard *whilst remaining compatible with it*.

#### Features

- Supports **Relative** and scheme-less URLs.
- Supports **Nullable Components**.
- Distinct **Rebase**, **Normalize** and **Resolve** methods.
- Resolve is **Behaviourally Equivalent** with the WHATWG URL Standard.

#### Examples

```javascript
new URLReference ('filename.txt#top', '//host') .href
// => '//host/filename.txt#top'

new URLReference ('?do=something', './path/to/resource?do=nothing') .href
// => './path/to/resource?do=something'

new URLReference ('take/action.html') .resolve ('http://🌲') .href
// => 'http://xn--vh8h/take/action.html'
```

#### Questions

Always feel free to ask questions. If you wish, you may file an issue for a
question.


[URL Specification]: https://alwinb.github.io/url-specification/
[WHATWG URL Standard]: https://url.spec.whatwg.org/
[RFC 3986]: https://tools.ietf.org/html/rfc3986
[NPM badge]: https://img.shields.io/npm/v/spec-url.svg?sort=semver
[spec-url on NPM]: https://npmjs.org/package/spec-url



API Summary
-----------

The module exports a single class `URLReference` with **nullable** properties (getters/setters):

- `scheme`,
- `username`, `password`, `hostname`, `port`,
- `pathname`, `pathroot`, `driveletter`, `filename`,  
- `query`, `fragment`.

It has three key methods:

- `rebase`, `normalize` and `resolve`.

It can be converted to an ASCII, or to a Unicode string via:

- the `href` getter and the `toString` method.



URLReference API
----------------

### Terminology

The WHATWG URL standard uses the phrase "__special URL__" for URLs that have a _special scheme_.
A scheme is a _special scheme_ if it is equivalent to `http`, `https`, `ws`, `wss`, `ftp` or `file`.

The _path_ of an URL may either be **hierarchical**, or **opaque**:
An _hierarchical path_ is subdivided into path components, an _opaque path_ is not.
The path of a "_special_ URL" is always considered to be hierarchical. 
The path of a non-special URL is opaque unless the URL has an authority or if its path starts with a path-root `/`.

### Constructor

- `new URLReference ()`
- `new URLReference (input)`
- `new URLReference (input, base)`

Constructs a new URLReference object. The result _may_ represent a relative URL. The _resolve_ method can be used to ensure that the result represents an absolute URL.

Arguments `input` and `base` are optional. Each may be a string to be parsed, or an existing URLReference object. If a `base` argument is supplied, then `input` is *rebased* onto `base` after parsing. 

**Parsing behaviour**

The parsing behaviour adapts to the scheme of `input` or the scheme of `base` otherwise:

* Any `\` code-points before the host and in the path are treated as `/` 
  if the input has a special scheme or if it has no scheme at all.

* Windows drive letters are detected if the scheme is equivalent to `file` or if no scheme is present at all. 
  If no scheme is present and a windows drive letter is detected then then the scheme is implicitly set to `file`.

The hostname is always parsed as an opaque hostname string. 
Parsing and validating a hostname as a domain is done by the resolve method instead.


**Examples:**

```javascript
const r1 = new URLReference ();
// r.href == '' // The 'empty relative URL'

const r2 = new URLReference ('/big/trees/');
// r.href == '/big/trees/'

const r3 = new URLReference ('index.html', '/big/trees/');
// r.href == '/big/trees/index.html'

const r4 = new URLReference ('README.md', r3);
// r.href == '/big/trees/README.md'
```

**Parsing Behaviour Examples:**

```javascript
const r1 = new URLReference ('\\foo\\bar', 'http:')
// r1.href == 'http:/foo/bar'

const r2 = new URLReference ('\\foo\\bar', 'ofp:/')
// r2.href == 'ofp:/\\foo\\bar'

const r3 = new URLReference ('/c:/path/to/file')
// r3.href == 'file:/c:/path/to/file'
// r3.hostname == null
// r3.driveletter == 'c:'

const r4 = new URLReference ('/c:/path/to/file', 'http:')
// r4.href == 'http:/c:/path/to/file'
// r4.hostname == null
// r4.driveletter == null

```

### Rebase

**Rebase** – `uriReference .rebase (base)`

The _base_ argument may be a string or a URLReference object. 
Rebase returns a new URLReference instance.
It throws an error if the base argument reprensents an URL with an _opaque path_ (unless _uriReference_ consists of a fragment identifier only, in which case rebase is allowed).

Rebase implements a _slight generalisation_ of [reference transformation][T] as defined
in RFC3986. In our case the _base_ argument is allowed to be a relative reference, in
addition to an absolute URL.

* The RFC3986 (URL) standard defines a **strict** and a **non-strict** variant of _reference transformation_. 
  The _non-strict_ variant ignores the scheme of the input if it is equivalent to the scheme of the base. 

Rebase applies a _non-strict_ reference transformation to URLReferences that have a "_special scheme_"
and a _strict_ reference transformation in all other cases. This matches the behaviour of the WHATWG URL standard.

[T]: https://www.rfc-editor.org/rfc/rfc3986#section-5.2.2
[RFC3986]: https://www.rfc-editor.org/rfc/rfc3986

**Example — non-strict behaviour:**

The "non-strict" behaviour for has a surprising consequence:
An URLReference that has a special scheme may still "behave as a relative URL".

```javascript
const base = new URLReference ('http://host/dir/')
const rel = new URLReference ('http:?do=something')
const rebased = rel.rebase (base)
// rebased.href == 'http://host/dir/?do=something'
```

**Example — strict behaviour:**

Rebase applies a "strict" reference transformation to non-special URLReferences. The strict variant does not remove the scheme from the input:

```javascript
const base = new URLReference ('ofp://host/dir/')
const abs = new URLReference ('ofp:?do=something')
const rebased = abs.rebase (base)
// rebased.href == 'ofp:?do=something'
```

**Example — opaque path behaviour:**

It is not possible to rebase a relative URLReference on a base that has an _opaque path_. 

```javascript
const base = new URLReference ('ofp:this/is/an/opaque-path/')
const rel = new URLReference ('filename.txt')
// const rebased = rel.rebase (base) // throws:
// TypeError: Cannot rebase <filename.txt> onto <ofp:this/is/an/opaque-path/>

const base2 = new URLReference ('ofp:/not/an/opaque-path/')
const rebased = rel.rebase (base2) // This works as expected
// rebased.href == 'ofp:/not/an/opaque-path/filename.txt'
```

### Normalize

**Normalize** – `uriReference .normalize ()`

Normalize collapses dotted segments in the path, removes default ports and percent encodes certain code-points. It behaves in the same way as the WHATWG URL constructor, except for the fact that it supports relative URLs. It does not interpret hostnames as a domain, this is done in the resolve method instead. Normalize always returns a new URLReference instance. 


### Resolve

**Resolve** 

- `uriReference .resolve ()`
- `uriReference .resolve (base)`

The optional `base` argument may be a string or an existing URLReference object. 
Resolve returns a new URLReference that represents an absolute URL.
It throws an error if this is not possible.

Resolve does additional processing and checks on the authority:

- Asserts that file-URLs and web-URLs have an authority.
- Asserts that the authority of web-URLs is not empty.
- Asserts that file-URLs do not have a username, password or port.
- Parses opaque hostnames of file-URLs and web-URLs as a domain or an IPv4-address.

Resolve uses the same forceful error correcting behaviour as the WHATWG URL constructor.

*Note*: An unpleasant aspect of the WHATWG behaviour is that if the input is a non-file special URL, and the input has no authority, then the first non-empty path component will be coerced to an authority:

```javascript
const r1 = new URLReference ('http:/foo/bar')
// r.host == null
// r.pathname == '/foo/bar'

const r2 = r1.resolve ('http://host/')
// The scheme of r1 is ignored because it matches the base.
// Thus the hostname is taken from the base.
// r2.href == 'http://host/foo/bar'

const r3 = r1.resolve ()
// r1 does not have an authority, so the first non-empty path
// component `foo` is coerced into an authority for the result.
// r1.href == 'http://foo/bar'
```


**String** – `uriReference .toString ()`

Converts the URLReference to a string. This _preserves_ unicode characters in the URL, unlike the `href` getter which ensures that the result consists of ASCII code-points only.

```javascript
new URLReference ('take/action.html') .resolve ('http://🌲') .toString ()
// => 'http://🌲/take/action.html'

new URLReference ('take/action.html') .resolve ('http://🌲') .href
// => 'http://xn--vh8h/take/action.html'
```


### Properties

Access to the components of the URLReference goes through the following getters/setters.
All properties are nullable, however some invariants are maintained.

- `scheme`
- `username`
- `password`
- `hostname`
- `port`
- `pathname`
+ `driveletter`
+ `pathroot`
+ `filename`
- `query`
- `fragment`

Property setters may throw an error if using the supplied value would result in an
invalid or malformed URLReference object.

The properties `driveletter`, `pathroot` and `filename` do not use the idiomatic
camelCase style. This is is done to remain consistent with existing property
names of the WHATWG URL class, such as `pathname` and `hostname`.


Changelog
---------

### Version 3.0.0

- Introduces the URLReference class to be used as the main API.

### Version 2.5.0-dev

- Introduces URLIPv4Address, URLIPv6Address and URLDomainName objects to be used as hosts.
- The [URLReference] project is now available as well!
- Uses component character equivalence classes with an action table for percent coding, normalisation and validation. 

[URLReference]: https://github.com/alwinb/url-reference/

### Version 2.4.0-dev

- Exports a parsePath (input [, mode]) function.
- Includes proper IDNA domain name handling via [tr46].
- Removes the forceAsFileUrl, forceAsWebUrl and force functions.
- Uses a table-driven URL parser, suitable for an algorithmic specification.

### Version 2.3.3-dev

- Exports the printHost function.
- Restores genericResolve to its pre 2.3.2-dev behaviour.

### Version 2.3.2-dev

- The rebase function now distinguishes URLs by their scheme akin to (WHATWG) resolve. 
- Dotted file-segments are now parsed as dir segments.
- Corrects a mistake where path normalisation could result in an empty URL.
- Corrects a mistake where path normalisation would incorrectly discard leading double-dot segments.

### Version 2.3.1-dev

- Corrects a mistake where scheme-less URLs were in fact not handled as suggested in the latest release notes.
- The parser no longer enforces that web-URLs have a non-empty host, this is enforced just before resolution only.

### Version 2.3.0-dev

Towards a simple API without modes; towards loosening the constraints on the model a bit, and enforcing them in the resolution operation:

- The goto (url2, url1) operation has been renamed to **rebase** (url1, url2).
- Scheme-less URLs are now separated out to use a default **noscheme** mode.
- Scheme-less URLs are now always percent-encoded akin to special URLs.
- The model for the host has changed to distinguish between a domain, an IPv4 address, an IPv6 address and an opaque host. 
- The authority parser has been rewritten.
- Forcing and host parsing has been refactored.
- The authority constraints on file- and web-URLs are enforced in the force operation.

### Version 2.2.0-dev

- Exports unsafePrint, pathname and filePath functions.
- Exports parseResolve as an alias for WHATWGParseResolve.
- <s>Exports an errors (obj) functon to return a list of violated structural constraints, if any.</s>
- Catch up with WHATWG changes: C0-control and DEL codepoints are no longer allowed in domains.
- Prevent reparse bugs for relative URLs that start with  a scheme-like dir or file component.
- Fix a regression where non-character codepoints were not correctly percent encoded.

### Version 2.1.0-dev

- Refactored the percent coding, making it possible to convert URL-objects to a valid URI (RFC3986), a _valid_ URL, or as specified by the WHATWG, to a normalised but potentially invalid URL.
- Catching up with WHATWG changes: the host parser will now raise an error on domains that end in a number.
- Removed the _isBase_ method in favour of an _hasOpaquePath_ method.

### Version 2.0.0-dev.1

- Changes to the API for forcing and reference resolution.
- A fix for normalisation of opaque-path-URL that resulted in a difference in behaviour with the WHATWG Standard. 

### Version 1.5.0

- Includes both a CommonJS version and an ES Module. 🌿
- Includes various changes from the 2.x.x-dev versions:
- Exports the pathname and unsafePrint functions.
- Exports parseResolve as an alias for WHATWGParseResolve.
- The host parser will now raise an error on domains that end in a number.
- Includes a fix for normalisation of opaque-path-URL that resulted in a difference in behaviour with the WHATWG Standard. 
- Prevents reparse bugs for scheme-less URLs that start with a scheme-like path component.

### Version 1.4.0

- Converted the project from a CommonJS module to an EcmaScript module
- ⚠️ This should have been considered a breaking change. 

### Version 1.3.0

- Use strict resolution for generic URLs, in accordance with the WHATWG standard. 
- Expose a strictness option on the resolve operations.

### Version 1.2.0

- Expose a WHATWGParseResolve (string, base-string) to work similar to the WHATWG URL constructor — new URL (string, base-string). 


Licence
-------

- Code original to this project is MIT licenced, copyright Alwin Blok.
- The [punycode.js] library is MIT licenced, copyright Mathias Bynens.
- The [tr46] library is MIT licenced, copyright Sebastian Mayr.

[spec-url]: https://github.com/alwinb/spec-url
[punycode.js]: https://github.com/mathiasbynens/punycode.js
[tr46]: https://github.com/jsdom/tr46

