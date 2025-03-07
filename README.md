[![NPM badge]][spec-url on NPM]  


URL Implementation 
==================

# 🌲

An URL manipulation library that supports URL records, relative URLs, reference resolution and a number of other elementary operations on URLs in a way that is compatible with the [WHATWG URL Standard].

This library serves as a reference implementation for this [URL Specification], which is an alternative URL specification that rephrases and generalises the WHATWG URL Standard to add support for relative URLs, reference resolution and a number of other elementary operations, as wel as restoring a formal grammar. 

Always feel free to ask questions. If you wish, you may file an issue for a question.

* The [URLReference] project is now available! This project provides an **URLReference** class that supports relative URLs whilst maintaining an API that is similar to the WHATWG **URL** class.

* An other alternative is my [reurl] library, which wraps around spec-url to provide an API for working with immutable URL objects. 


[URL Specification]: https://alwinb.github.io/url-specification/
[URLReference]: https://github.com/alwinb/url-reference/
[WHATWG URL Standard]: https://url.spec.whatwg.org/
[RFC 3986]: https://tools.ietf.org/html/rfc3986
[reurl]: https://github.com/alwinb/reurl

[NPM badge]: https://img.shields.io/npm/v/spec-url.svg?sort=semver
[spec-url on NPM]: https://npmjs.org/package/spec-url


API
---

### URL

In this implementation an URL is modeled as a plain JavaScript object with the following _optional_ attributes:

* **scheme**, **user**, **pass**, **host**, **port**, **drive**, **root**, **dirs**, **file**, **query**, **hash**

If present, **dirs** is an non-empty array of strings; **host** is a _Host_ (see below) and all other attributes are strings. The string valued attributes are subject to the constraints as described in my [URL Specification].

A _Host_ is either an **URLIPv6Address**, an **URLDomainName**, an **URLIPv4Address**, or an opaque host **string**.

<details>
<summary>Note</summary>

The [URL Specification] models URLs as [ordered sequences of components][URL Model], "with at most one component per type, except for **dir** componens, of which it may have any amount". Futhermore, the **username**, **password**, **host** and **port** are nested inside an **authority** component.

In this this library URLs are modeled as plain JavaScript objects. The **dir** components, if present, are collected into a single **dirs** _array_, and the **authority**, if present, is expanded by setting any of its **user**, **pass**, **host** and **port** constituents directly on the url object itself. 

There is a one-to-one correspondence between this representation and sequences of components as defined in the URL specification.
</details>

[URL Model]: https://alwinb.github.io/url-specification/#url-model

### Basics

* componentTypes — { scheme, auth, drive, root, dir, file, query, hash } — aka. ords
* ord (url)
* upto (url, ord)

### Rebase and Resolve

The _rebase_ function is the preferred method for composing URLs. It can be thought of as a _resolve_ function for relative URLs.
The rebase function does not attempt to parse opaque hosts as a domain, and does not enforce additional requirements on the authority.

* rebase (url-or-string, base-url-or-string)
  - aka. goto (base-url-or-string, url-or-string) — (flipped arguments, deprecated)
  - aka. parseRebase (url-or-string, base-url-or-string)

The _resolve_ function is similar to _rebase_ but it always produces an absolute URL, or throws an error if it is unable to do so.
It coerces special URLs to have an authority, and parses their hosts as a domain. It enforces that file URLs do not have a user, pass nor port. 
NB this converts the first non-empty path segment of a web-URL to an authority if this is needed.

* resolve (url-or-string [, base-url-or-string])
  - aka. parseResolve
  - aka. WHATWGResolve

### Options

* modes — { generic, web, file, noscheme }
* modeFor (url, fallback)

### Parsing

* parse (string [, mode])
* parsePath (string [, mode])
* parseAuth (string)
* parseHost (string-or-host)
* validateOpaqueHost (string)
* parseRebase (string [, base-url-or-string])
* parseResolve (string [, base-url-or-string])

### Normalisation

* normalise (url) — aka. normalize
* percentEncode (url)
* percentDecode (url)

### Printing

* print (url)
* pathname (url)
* filePath (url) — returns a filesystem–path-string
* unsafePrint (url)

### Host Parsing Internals

* ipv4
  * parse (string)
  * print (number)
  * normalise (string)
* ipv6
  * parse (string)
  * print (num-array)
  * normalise (string)


Changelog
---------

### Version 2.5.0-dev

- Introduces URLIPv4Address, URLIPv6Address and URLDomainName objects to be used as hosts.
- The [URLReference] project is now available as well!
- Uses component character equivalence classes with an action table for percent coding, normalisation and validation. 

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

