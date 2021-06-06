URL Implementation
==================

[![NPM version][npm-image]][npm-url]

[npm-image]: https://img.shields.io/npm/v/spec-url.svg
[npm-url]: https://npmjs.org/package/spec-url

# 🌲

An URL manipulation library that supports URL records, relative URLs, reference resolution and a number of other elementary operations on URLs in a way that is compatible with the [WHATWG URL Standard][wwg].

This library serves as a reference implementation for this [URL Specification][url-spec], which is an alternative URL specification that rephrases and generalises the WHATWG URL Standard to add support for relative URLs, reference resolution and a number of other elementary operations. 

People are encouraged to experiment with creating more high level APIs around this library. One example is my [reurl] library, which wraps around spec-url to provide a high level API for immutable URL objects. 

[url-spec]: https://alwinb.github.io/url-specification/
[url-spec-model]: https://alwinb.github.io/url-specification/#url-model
[wwg]: https://url.spec.whatwg.org/
[reurl]: https://github.com/alwinb/reurl

API
---

The library exposes a concise, low-level API for working with URL strings and URL records. It models URLs as plain javascript objects and it exposes a number of _functions_ for working with them.

### URLs

In this implementation URLs are modeled as plain JavaScript objects with the following _optional_ attributes:

* **scheme**, **user**, **pass**, **host**, **port**, **drive**, **root**, **dirs**, **file**, **query**, **hash**

Here, **dirs**, if present is an non-empty array of strings and all other attributes are strings. The string valued attributes are subject to the constraints as described in the specification.

### Predicates

* isBase (url)
* isResolved (url)

### Reference Resolution

* ords
* ord (url)
* upto (url, ord)
* goto (url1, url2 [, options])
* preResolve (url1, url2 [, options])
* resolve (url1, url2 [, options])
* force (url)
* forceResolve (url1, url2 [, options])

The _options_ argument, if present, must be an object with a boolean property _strict_ to indicate if the strict- or non-strict goto operation must be used. It defaults to **false**. 

**NB** The strictness option may be passed to forceResolve as well. This specifies the behaviour of the goto operation that it uses. Using forced resolution itself is not 'strict behaviour' though, but serves as an error recovery measure for file-, and web-URLs that have an empty or absent host. 

### Normalisation

* normalise (url), normalize (url)
* percentEncode (url)
* percentDecode (url)

### Parsing and Printing

* modes
* modeFor (url, fallback)
* parse (string [, mode])
* parseAuth (string [, mode])
* parseHost (string [, mode])
* print (url)

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


Notes on the Specification
--------------------------

The [URL Specification][url-spec] models URLs as [ordered sequences of tokens][url-spec-model], with at most one token per type, except for **dir** tokens, of which it may have any amount. Futhermore, the **username**, **password**, **host** and **port** are nested inside an **authority** token. This representation is a good fit for the specification.

For implementations however it makes sense to model URLs as records, or in the case of this library, as plain JavaScript objects. The **dir** tokens, if present, are collected into a **dirs** array and the **authority**, if present, is flattened by setting any of its **user**, **pass**, **host** and **port** constituents directly on the url object itself. Such records are in one-to-one correspondence with the sequences of tokens as defined in the URL specification.


Licence
-------

MIT




