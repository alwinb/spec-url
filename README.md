[![NPM badge]][spec-url on NPM]  


URL Implementation 
==================

# 🌲

An URL manipulation library that supports URL records, relative URLs, reference resolution and a number of other elementary operations on URLs in a way that is compatible with the [WHATWG URL Standard].

This library serves as a reference implementation for this [URL Specification], which is an alternative URL specification that rephrases and generalises the WHATWG URL Standard to add support for relative URLs, reference resolution and a number of other elementary operations, as wel as restoring a formal grammar. 

People are encouraged to experiment with creating more high level APIs around this library. One example is my [reurl] library, which wraps around spec-url to provide a high level API for immutable URL objects. 

[URL Specification]: https://alwinb.github.io/url-specification/
[WHATWG Standard]: https://url.spec.whatwg.org/
[WHATWG URL Standard]: https://url.spec.whatwg.org/
[RFC 3986]: https://tools.ietf.org/html/rfc3986
[reurl]: https://github.com/alwinb/reurl

[NPM badge]: https://img.shields.io/npm/v/spec-url.svg
[spec-url on NPM]: https://npmjs.org/package/spec-url


API
---

The library exposes a concise, low-level API for working with URL strings and URL records. It models URLs as plain javascript objects and it exposes a number of _functions_ for working with them.

### URLs

URLs are modeled as plain JavaScript objects with the following _optional_ attributes:

* **scheme**, **user**, **pass**, **host**, **port**, **drive**, **root**, **dirs**, **file**, **query**, **hash**

If present, **dirs** is an non-empty array of strings; all other attributes are strings. The string valued attributes are subject to the constraints as described in my [URL Specification].

### Validation

URL objects are also subject to structural constraints. The errors function returns a list of violations, if any. 

* errors (obj)

### Goto

* ords — { scheme, auth, drive, root, dir, file, query, hash }
* ord (url)
* upto (url, ord)
* goto (url1, url2 [, options])

### Forcing

* forceAsFileUrl (url)
* forceAsWebUrl (url)
* force (url)

### Reference Resolution

* hasOpaquePath (url)
* genericResolve (url1, url2) — RFC 3986 _strict_ resolution.
* legacyResolve (url1, url2) — RFC 3986 _non-strict_ resolution.
* WHATWGResolve (url1, url2)
* resolve (url1, url2) — aka. WHATWGResove

### Normalisation

* normalise (url) — aka. normalize
* percentEncode (url)
* percentDecode (url)

### Parsing and Printing

* modes — { generic, web, file }
* modeFor (url, fallback)
* parse (string [, mode])
* parseAuth (string [, mode])
* parseHost (string [, mode])
* print (url)
* unsafePrint (url)
* pathname (url)
* filePath (url) — returns a filesystem–path-string

### Host processing

* ipv4
  * parse (string)
  * print (number)
  * normalise (string)
* ipv6
  * parse (string)
  * print (num-array)
  * normalise (string)

### Parse Resolve and Normalise

* WHATWGParseResolve (string, base-string)
* parseResolve (string, base-string) — aka. WHATWGParseResolve


A Note - URL Objects
--------------------

The [URL Specification] models URLs as [ordered sequences of components][URL Model], "with at most one component per type, except for **dir** componens, of which it may have any amount". Futhermore, the **username**, **password**, **host** and **port** are nested inside an **authority** componen.

This representation works well for the specification. But for implementations it makes sense to model URLs as records or objects instead. 

In this this library URLs are modeled as plain JavaScript objects. The **dir** componens, if present, are collected into a single **dirs** _array_, and the **authority**, if present, is expanded by setting any of its **user**, **pass**, **host** and **port** constituents directly on the url object itself. 

There is a one-to-one correspondence between this representation and sequences of componens as defined in the URL specification.

[URL Model]: https://alwinb.github.io/url-specification/#url-model


Changelog
---------

### Version 2.2.0-dev

- Exports unsafePrint, pathname and filePath functions.
- Exports parseResolve as an alias for WHATWGParseResolve.
- Exports an errors (obj) functon to return a list of violated structural constraints, if any.
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

### Version 1.4.0

**WARNING** This version was released as a CommonJS module. This should have been considered a breaking change. 

- Converted the project from a CommonJS module to an EcmaScript module

### Version 1.3.0

- Use strict resolution for generic URLs, in accordance with the WHATWG standard. 
- Expose a strictness option on the resolve operations.

### Version 1.2.0

- Expose a WHATWGParseResolve (string, base-string) to work similar to the WHATWG URL constructor — new URL (string, base-string). 


Licence
-------

MIT




