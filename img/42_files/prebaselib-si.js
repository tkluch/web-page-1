// https://github.com/taylorhakes/promise-polyfill

(function (root) {

    // Store setTimeout reference so promise-polyfill will be unaffected by
    // other code modifying setTimeout (like sinon.useFakeTimers())
    var setTimeoutFunc = setTimeout;

    function noop() {}

    // Polyfill for Function.prototype.bind
    function bind(fn, thisArg) {
        return function () {
            fn.apply(thisArg, arguments);
        };
    }

    function Promise(fn) {
        if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
        if (typeof fn !== 'function') throw new TypeError('not a function');
        this._state = 0;
        this._handled = false;
        this._value = undefined;
        this._deferreds = [];

        doResolve(fn, this);
    }

    function handle(self, deferred) {
        while (self._state === 3) {
            self = self._value;
        }
        if (self._state === 0) {
            self._deferreds.push(deferred);
            return;
        }
        self._handled = true;
        Promise._immediateFn(function () {
            var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
            if (cb === null) {
                (self._state === 1 ? resolve : reject)(deferred.promise, self._value);
                return;
            }
            var ret;
            try {
                ret = cb(self._value);
            } catch (e) {
                reject(deferred.promise, e);
                return;
            }
            resolve(deferred.promise, ret);
        });
    }

    function resolve(self, newValue) {
        try {
            // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
            if (newValue === self) throw new TypeError('A promise cannot be resolved with itself.');
            if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
                var then = newValue.then;
                if (newValue instanceof Promise) {
                    self._state = 3;
                    self._value = newValue;
                    finale(self);
                    return;
                } else if (typeof then === 'function') {
                    doResolve(bind(then, newValue), self);
                    return;
                }
            }
            self._state = 1;
            self._value = newValue;
            finale(self);
        } catch (e) {
            reject(self, e);
        }
    }

    function reject(self, newValue) {
        self._state = 2;
        self._value = newValue;
        finale(self);
    }

    function finale(self) {
        if (self._state === 2 && self._deferreds.length === 0) {
            Promise._immediateFn(function() {
                if (!self._handled) {
                    Promise._unhandledRejectionFn(self._value);
                }
            });
        }

        for (var i = 0, len = self._deferreds.length; i < len; i++) {
            handle(self, self._deferreds[i]);
        }
        self._deferreds = null;
    }

    function Handler(onFulfilled, onRejected, promise) {
        this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
        this.onRejected = typeof onRejected === 'function' ? onRejected : null;
        this.promise = promise;
    }

    /**
     * Take a potentially misbehaving resolver function and make sure
     * onFulfilled and onRejected are only called once.
     *
     * Makes no guarantees about asynchrony.
     */
    function doResolve(fn, self) {
        var done = false;
        try {
            fn(function (value) {
                if (done) return;
                done = true;
                resolve(self, value);
            }, function (reason) {
                if (done) return;
                done = true;
                reject(self, reason);
            });
        } catch (ex) {
            if (done) return;
            done = true;
            reject(self, ex);
        }
    }

    Promise.prototype['catch'] = function (onRejected) {
        return this.then(null, onRejected);
    };

    Promise.prototype.then = function (onFulfilled, onRejected) {
        var prom = new (this.constructor)(noop);

        handle(this, new Handler(onFulfilled, onRejected, prom));
        return prom;
    };

    Promise.all = function (arr) {
        var args = Array.prototype.slice.call(arr);

        return new Promise(function (resolve, reject) {
            if (args.length === 0) return resolve([]);
            var remaining = args.length;

            function res(i, val) {
                try {
                    if (val && (typeof val === 'object' || typeof val === 'function')) {
                        var then = val.then;
                        if (typeof then === 'function') {
                            then.call(val, function (val) {
                                res(i, val);
                            }, reject);
                            return;
                        }
                    }
                    args[i] = val;
                    if (--remaining === 0) {
                        resolve(args);
                    }
                } catch (ex) {
                    reject(ex);
                }
            }

            for (var i = 0; i < args.length; i++) {
                res(i, args[i]);
            }
        });
    };

    Promise.resolve = function (value) {
        if (value && typeof value === 'object' && value.constructor === Promise) {
            return value;
        }

        return new Promise(function (resolve) {
            resolve(value);
        });
    };

    Promise.reject = function (value) {
        return new Promise(function (resolve, reject) {
            reject(value);
        });
    };

    Promise.race = function (values) {
        return new Promise(function (resolve, reject) {
            for (var i = 0, len = values.length; i < len; i++) {
                values[i].then(resolve, reject);
            }
        });
    };

    // Use polyfill for setImmediate for performance gains
    Promise._immediateFn = (typeof setImmediate === 'function' && function (fn) { setImmediate(fn); }) ||
        function (fn) {
            setTimeoutFunc(fn, 0);
        };

    Promise._unhandledRejectionFn = function _unhandledRejectionFn(err) {
        if (typeof console !== 'undefined' && console) {
            console.warn('Possible Unhandled Promise Rejection:', err); // eslint-disable-line no-console
        }
    };

    /**
     * Set the immediate function to execute callbacks
     * @param fn {function} Function to execute
     * @deprecated
     */
    Promise._setImmediateFn = function _setImmediateFn(fn) {
        Promise._immediateFn = fn;
    };

    /**
     * Change the function to execute on unhandled rejection
     * @param {function} fn Function to execute on unhandled rejection
     * @deprecated
     */
    Promise._setUnhandledRejectionFn = function _setUnhandledRejectionFn(fn) {
        Promise._unhandledRejectionFn = fn;
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Promise;
    } else if (!root.Promise) {
        root.Promise = Promise;
    }

})(this);

// https://github.com/github/fetch

(function(self) {
    'use strict';

    if (self.fetch) {
        return
    }

    var support = {
        searchParams: 'URLSearchParams' in self,
        iterable: 'Symbol' in self && 'iterator' in Symbol,
        blob: 'FileReader' in self && 'Blob' in self && (function() {
            try {
                new Blob()
                return true
            } catch(e) {
                return false
            }
        })(),
        formData: 'FormData' in self,
        arrayBuffer: 'ArrayBuffer' in self
    }

    if (support.arrayBuffer) {
        var viewClasses = [
            '[object Int8Array]',
            '[object Uint8Array]',
            '[object Uint8ClampedArray]',
            '[object Int16Array]',
            '[object Uint16Array]',
            '[object Int32Array]',
            '[object Uint32Array]',
            '[object Float32Array]',
            '[object Float64Array]'
        ]

        var isDataView = function(obj) {
            return obj && DataView.prototype.isPrototypeOf(obj)
        }

        var isArrayBufferView = ArrayBuffer.isView || function(obj) {
            return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
        }
    }

    function normalizeName(name) {
        if (typeof name !== 'string') {
            name = String(name)
        }
        if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
            throw new TypeError('Invalid character in header field name')
        }
        return name.toLowerCase()
    }

    function normalizeValue(value) {
        if (typeof value !== 'string') {
            value = String(value)
        }
        return value
    }

    // Build a destructive iterator for the value list
    function iteratorFor(items) {
        var iterator = {
            next: function() {
                var value = items.shift()
                return {done: value === undefined, value: value}
            }
        }

        if (support.iterable) {
            iterator[Symbol.iterator] = function() {
                return iterator
            }
        }

        return iterator
    }

    function Headers(headers) {
        this.map = {}

        if (headers instanceof Headers) {
            headers.forEach(function(value, name) {
                this.append(name, value)
            }, this)
        } else if (Array.isArray(headers)) {
            headers.forEach(function(header) {
                this.append(header[0], header[1])
            }, this)
        } else if (headers) {
            Object.getOwnPropertyNames(headers).forEach(function(name) {
                this.append(name, headers[name])
            }, this)
        }
    }

    Headers.prototype.append = function(name, value) {
        name = normalizeName(name)
        value = normalizeValue(value)
        var oldValue = this.map[name]
        this.map[name] = oldValue ? oldValue+','+value : value
    }

    Headers.prototype['delete'] = function(name) {
        delete this.map[normalizeName(name)]
    }

    Headers.prototype.get = function(name) {
        name = normalizeName(name)
        return this.has(name) ? this.map[name] : null
    }

    Headers.prototype.has = function(name) {
        return this.map.hasOwnProperty(normalizeName(name))
    }

    Headers.prototype.set = function(name, value) {
        this.map[normalizeName(name)] = normalizeValue(value)
    }

    Headers.prototype.forEach = function(callback, thisArg) {
        for (var name in this.map) {
            if (this.map.hasOwnProperty(name)) {
                callback.call(thisArg, this.map[name], name, this)
            }
        }
    }

    Headers.prototype.keys = function() {
        var items = []
        this.forEach(function(value, name) { items.push(name) })
        return iteratorFor(items)
    }

    Headers.prototype.values = function() {
        var items = []
        this.forEach(function(value) { items.push(value) })
        return iteratorFor(items)
    }

    Headers.prototype.entries = function() {
        var items = []
        this.forEach(function(value, name) { items.push([name, value]) })
        return iteratorFor(items)
    }

    if (support.iterable) {
        Headers.prototype[Symbol.iterator] = Headers.prototype.entries
    }

    function consumed(body) {
        if (body.bodyUsed) {
            return Promise.reject(new TypeError('Already read'))
        }
        body.bodyUsed = true
    }

    function fileReaderReady(reader) {
        return new Promise(function(resolve, reject) {
            reader.onload = function() {
                resolve(reader.result)
            }
            reader.onerror = function() {
                reject(reader.error)
            }
        })
    }

    function readBlobAsArrayBuffer(blob) {
        var reader = new FileReader()
        var promise = fileReaderReady(reader)
        reader.readAsArrayBuffer(blob)
        return promise
    }

    function readBlobAsText(blob) {
        var reader = new FileReader()
        var promise = fileReaderReady(reader)
        reader.readAsText(blob)
        return promise
    }

    function readArrayBufferAsText(buf) {
        var view = new Uint8Array(buf)
        var chars = new Array(view.length)

        for (var i = 0; i < view.length; i++) {
            chars[i] = String.fromCharCode(view[i])
        }
        return chars.join('')
    }

    function bufferClone(buf) {
        if (buf.slice) {
            return buf.slice(0)
        } else {
            var view = new Uint8Array(buf.byteLength)
            view.set(new Uint8Array(buf))
            return view.buffer
        }
    }

    function Body() {
        this.bodyUsed = false

        this._initBody = function(body) {
            this._bodyInit = body
            if (!body) {
                this._bodyText = ''
            } else if (typeof body === 'string') {
                this._bodyText = body
            } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
                this._bodyBlob = body
            } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
                this._bodyFormData = body
            } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
                this._bodyText = body.toString()
            } else if (support.arrayBuffer && support.blob && isDataView(body)) {
                this._bodyArrayBuffer = bufferClone(body.buffer)
                // IE 10-11 can't handle a DataView body.
                this._bodyInit = new Blob([this._bodyArrayBuffer])
            } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
                this._bodyArrayBuffer = bufferClone(body)
            } else {
                throw new Error('unsupported BodyInit type')
            }

            if (!this.headers.get('content-type')) {
                if (typeof body === 'string') {
                    this.headers.set('content-type', 'text/plain;charset=UTF-8')
                } else if (this._bodyBlob && this._bodyBlob.type) {
                    this.headers.set('content-type', this._bodyBlob.type)
                } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
                    this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
                }
            }
        }

        if (support.blob) {
            this.blob = function() {
                var rejected = consumed(this)
                if (rejected) {
                    return rejected
                }

                if (this._bodyBlob) {
                    return Promise.resolve(this._bodyBlob)
                } else if (this._bodyArrayBuffer) {
                    return Promise.resolve(new Blob([this._bodyArrayBuffer]))
                } else if (this._bodyFormData) {
                    throw new Error('could not read FormData body as blob')
                } else {
                    return Promise.resolve(new Blob([this._bodyText]))
                }
            }

            this.arrayBuffer = function() {
                if (this._bodyArrayBuffer) {
                    return consumed(this) || Promise.resolve(this._bodyArrayBuffer)
                } else {
                    return this.blob().then(readBlobAsArrayBuffer)
                }
            }
        }

        this.text = function() {
            var rejected = consumed(this)
            if (rejected) {
                return rejected
            }

            if (this._bodyBlob) {
                return readBlobAsText(this._bodyBlob)
            } else if (this._bodyArrayBuffer) {
                return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
            } else if (this._bodyFormData) {
                throw new Error('could not read FormData body as text')
            } else {
                return Promise.resolve(this._bodyText)
            }
        }

        if (support.formData) {
            this.formData = function() {
                return this.text().then(decode)
            }
        }

        this.json = function() {
            return this.text().then(JSON.parse)
        }

        return this
    }

    // HTTP methods whose capitalization should be normalized
    var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']

    function normalizeMethod(method) {
        var upcased = method.toUpperCase()
        return (methods.indexOf(upcased) > -1) ? upcased : method
    }

    function Request(input, options) {
        options = options || {}
        var body = options.body

        if (input instanceof Request) {
            if (input.bodyUsed) {
                throw new TypeError('Already read')
            }
            this.url = input.url
            this.credentials = input.credentials
            if (!options.headers) {
                this.headers = new Headers(input.headers)
            }
            this.method = input.method
            this.mode = input.mode
            if (!body && input._bodyInit != null) {
                body = input._bodyInit
                input.bodyUsed = true
            }
        } else {
            this.url = String(input)
        }

        this.credentials = options.credentials || this.credentials || 'omit'
        if (options.headers || !this.headers) {
            this.headers = new Headers(options.headers)
        }
        this.method = normalizeMethod(options.method || this.method || 'GET')
        this.mode = options.mode || this.mode || null
        this.referrer = null

        if ((this.method === 'GET' || this.method === 'HEAD') && body) {
            throw new TypeError('Body not allowed for GET or HEAD requests')
        }
        this._initBody(body)
    }

    Request.prototype.clone = function() {
        return new Request(this, { body: this._bodyInit })
    }

    function decode(body) {
        var form = new FormData()
        body.trim().split('&').forEach(function(bytes) {
            if (bytes) {
                var split = bytes.split('=')
                var name = split.shift().replace(/\+/g, ' ')
                var value = split.join('=').replace(/\+/g, ' ')
                form.append(decodeURIComponent(name), decodeURIComponent(value))
            }
        })
        return form
    }

    function parseHeaders(rawHeaders) {
        var headers = new Headers()
        // Replace instances of \r\n and \n followed by at least one space or horizontal tab with a space
        // https://tools.ietf.org/html/rfc7230#section-3.2
        var preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ')
        preProcessedHeaders.split(/\r?\n/).forEach(function(line) {
            var parts = line.split(':')
            var key = parts.shift().trim()
            if (key) {
                var value = parts.join(':').trim()
                headers.append(key, value)
            }
        })
        return headers
    }

    Body.call(Request.prototype)

    function Response(bodyInit, options) {
        if (!options) {
            options = {}
        }

        this.type = 'default'
        this.status = options.status === undefined ? 200 : options.status
        this.ok = this.status >= 200 && this.status < 300
        this.statusText = 'statusText' in options ? options.statusText : 'OK'
        this.headers = new Headers(options.headers)
        this.url = options.url || ''
        this._initBody(bodyInit)
    }

    Body.call(Response.prototype)

    Response.prototype.clone = function() {
        return new Response(this._bodyInit, {
            status: this.status,
            statusText: this.statusText,
            headers: new Headers(this.headers),
            url: this.url
        })
    }

    Response.error = function() {
        var response = new Response(null, {status: 0, statusText: ''})
        response.type = 'error'
        return response
    }

    var redirectStatuses = [301, 302, 303, 307, 308]

    Response.redirect = function(url, status) {
        if (redirectStatuses.indexOf(status) === -1) {
            throw new RangeError('Invalid status code')
        }

        return new Response(null, {status: status, headers: {location: url}})
    }

    self.Headers = Headers
    self.Request = Request
    self.Response = Response

    self.fetch = function(input, init) {
        return new Promise(function(resolve, reject) {
            var request = new Request(input, init)
            var xhr = new XMLHttpRequest()

            xhr.onload = function() {
                var options = {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    headers: parseHeaders(xhr.getAllResponseHeaders() || '')
                }
                options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL')
                var body = 'response' in xhr ? xhr.response : xhr.responseText
                resolve(new Response(body, options))
            }

            xhr.onerror = function() {
                reject(new TypeError('Network request failed'))
            }

            xhr.ontimeout = function() {
                reject(new TypeError('Network request failed'))
            }

            xhr.open(request.method, request.url, true)

            if (request.credentials === 'include') {
                xhr.withCredentials = true
            } else if (request.credentials === 'omit') {
                xhr.withCredentials = false
            }

            if ('responseType' in xhr && support.blob) {
                xhr.responseType = 'blob'
            }

            request.headers.forEach(function(value, name) {
                xhr.setRequestHeader(name, value)
            })

            xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit)
        })
    }
    self.fetch.polyfill = true
})(typeof self !== 'undefined' ? self : this);

if (!NodeList.prototype.forEach) {
  NodeList.prototype.forEach = forEachPolyfill;
}

if (!HTMLCollection.prototype.forEach) {
  HTMLCollection.prototype.forEach = forEachPolyfill;
}

function forEachPolyfill(callback) {
  var numberOfElements = this.length,
    itemPosition;

  for (itemPosition = 0; itemPosition < numberOfElements; itemPosition++) {
    callback(this.item(itemPosition));
  }
}

if (!Array.isArray) {
  Array.isArray = function(arg) {
    return Object.prototype.toString.call(arg) === '[object Array]';
  };
}

(function() {
  function toArray() {
    return Array.prototype.slice.call(this, 0);
  }

  if (!NodeList.prototype.toArray) {
    NodeList.prototype.toArray = toArray;
  }

  if (!HTMLCollection.prototype.toArray) {
    HTMLCollection.prototype.toArray = toArray;
  }
})();

// https://developer.mozilla.org/pl/docs/Web/JavaScript/Referencje/Obiekty/Array/find#Polyfill
if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    if (this == null) {
      throw new TypeError('Array.prototype.find called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this),
      length = list.length >>> 0,
      thisArg = arguments[1],
      value,
      index;

    for (index = 0; index < length; index++) {
      value = list[index];
      if (predicate.call(thisArg, value, index, list)) {
        return value;
      }
    }
    return undefined;
  };
}

Object.assign = function(target, varArgs) {
  // .length of function is 2
  'use strict';
  if (target == null) {
    // TypeError if undefined or null
    throw new TypeError('Cannot convert undefined or null to object');
  }

  var to = Object(target);

  for (var index = 1; index < arguments.length; index++) {
    var nextSource = arguments[index];

    if (nextSource != null) {
      // Skip over if undefined or null
      for (var nextKey in nextSource) {
        // Avoid bugs when hasOwnProperty is shadowed
        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
          to[nextKey] = nextSource[nextKey];
        }
      }
    }
  }
  return to;
};

(function() {
  if (typeof window.CustomEvent === 'function') return false;

  function CustomEvent(event, params) {
    params = params || { bubbles: false, cancelable: false, detail: undefined };
    var evt = document.createEvent('CustomEvent');
    evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
    return evt;
  }

  CustomEvent.prototype = window.Event.prototype;

  window.CustomEvent = CustomEvent;
})();

LPP.price = LPP.price || {};
/**
 * Formats price based on BE options.
 *
 * Input parameters can be numbers but shouldn't be strings parsed with
 * parseFloat() or Number() directly as input strings might be '1.900' or '1,900'
 * which would be parsed as 1.9 and 1 respectively.
 *
 * @param {(String|Number|Array)} values - values to be formatted
 * @param {Boolean} [shouldGetFloat = undefined]
 * @returns {String}
 */
LPP.price.format = function(values, shouldGetFloat) {
  var price, valuesToFormat;

  if (Array.isArray(values) ? !values.join('') : !values) {
    return '';
  }

  valuesToFormat = Array.isArray(values) ? values : [values];

  price = valuesToFormat.reduce(function(price, value) {
    if (typeof value === 'number') {
      value = String(value);
    }
    return price + LPP.price.parseValue(value);
  }, 0);

  if (shouldGetFloat) {
    return price;
  }

  return LPP.price.finalFormat(price);
};

/**
 * @param {String} value
 * @returns {Number}
 */
LPP.price.parseValue = function(value) {
  var groupSeparator, decimalSeparator;

  if (!value) {
    return null;
  }

  groupSeparator = LegacyBridge.getStoreConfig('locale/symbols/group');
  decimalSeparator = LegacyBridge.getStoreConfig('locale/symbols/decimal');

  if (groupSeparator) {
    value = value.replace(new RegExp('\\' + groupSeparator + '(?=.{3})', 'g'), '');
  }
  value = value.replace(new RegExp('\\' + decimalSeparator), '.');

  return parseFloat(value);
};

/**
 * @param {Number|String} price
 * @returns {String}
 */
LPP.price.finalFormat = function(price) {
  const PATTERN_DECIMAL = /\.0*$/,
    PATTERN_CUT_OFF = /[^#,0.]*/g;

  var groupRegExp,
    priceParts,
    priceTotal,
    priceDecimal = '',
    pattern,
    groupSeparator,
    decimalSeparator,
    decimalMatch,
    decimalLength,
    isPriceInt,
    groupSeparatorPositions,
    multipleGroupSeparatorRules;

  if (typeof price === 'undefined') {
    return '';
  }

  pattern = LegacyBridge.getStoreConfig('locale/currencyNumber').replace(PATTERN_CUT_OFF, '');
  groupSeparatorPositions = pattern
    .replace(PATTERN_DECIMAL, '')
    .split(',')
    .reduce(function(array, value) {
      array.push(value.length);
      return array;
    }, [])
    .slice(1);
  multipleGroupSeparatorRules = groupSeparatorPositions.length > 1;

  if (multipleGroupSeparatorRules) {
    groupRegExp = new RegExp(
      '\\d(?=\\d{' +
        (groupSeparatorPositions[0] + groupSeparatorPositions[1]) +
        '}$)|' +
        '\\d(?=\\d{' +
        groupSeparatorPositions[1] +
        '}$)',
      'g'
    );
  } else {
    groupRegExp = new RegExp('\\d(?=(\\d{' + groupSeparatorPositions[0] + '})+$)', 'g');
  }

  decimalMatch = pattern.match(PATTERN_DECIMAL);
  decimalLength = decimalMatch ? decimalMatch[0].length - 1 : 0;
  isPriceInt = decimalLength === 0;

  if (isPriceInt) {
    priceTotal = price.toFixed(0);
  } else {
    priceParts = price.toFixed(decimalLength).split('.');
    priceTotal = priceParts[0];
    priceDecimal = priceParts[1];
  }

  groupSeparator = LegacyBridge.getStoreConfig('locale/symbols/group');
  decimalSeparator = LegacyBridge.getStoreConfig('locale/symbols/decimal');

  priceTotal = priceTotal.replace(groupRegExp, '$&' + groupSeparator);
  price = isPriceInt ? priceTotal : priceTotal + decimalSeparator + priceDecimal;

  return price;
};

/**
 * render Mustache template from html file in templateUrl inside parentNode with variables set in variablesObject
 * @param parentNode
 * @param templateUrl
 * @param [variablesObject]
 */
(function(global) {
    var cache = Object.create(null);

    function getTpl(url) {
        if (cache[url]) {
            return Promise.resolve(cache[url]);
        }
        return fetch(url).then(function(response) { return cache[url] = response.text(); })
    }

    global.setMustacheTemplate = function(parentNode, templateUrl, variablesObject) {
        variablesObject = variablesObject || {};
        return getTpl(templateUrl).then(function(tpl) {
            var html = Mustache.render(tpl, variablesObject);
            parentNode.innerHTML = html;

            return html;
        }).catch(function (err) {
            // brak obsługi błędów
        });
    };
})(LPP.common);

LPP.common = LPP.common || {};
LPP.common.checkout = LPP.common.checkout || {};

/**
 * Check if post-code is on unavailable area list,
 * resolve promise with true when post-code is block
 * resolve promise with false when post-code is supported
 *
 * @param postcode
 * @return promise
 */
LPP.common.checkout.isPostCodeOutOfService = function(postcode) {
  if (!LPP.common.checkout.isPostCodeOutOfServiceUrl) {
    return new Promise(function(resolve) {
      resolve(false);
    });
  }

  return fetch(LPP.common.checkout.isPostCodeOutOfServiceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'postcode=' + postcode,
  }).then(function(response) {
    return response.json();
  });
};

// /**
//  * Check if postcode is on handled postcodes list,
//  * resolve promise with true when postcode is handled
//  * resolve promise with false when postcode is not handled
//  *
//  * @param postcode
//  * @return promise
//  */

LPP.common.checkout.isPostcodeInService = function(postcode, deliveryType) {
  if (!LPP.common.checkout.blockNotInServicePostcodesEnabled || deliveryType === LPP.common.shipping.storeMethod) {
    return Promise.resolve(true);
  }

  return fetch(LPP.common.checkout.isPostcodeInServiceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'postcode=' + postcode + '&couriercode=' + deliveryType,
  })
    .then(function(response) {
      return response.json();
    })
    .catch(function() {
      return true;
    });
};

LPP.common.rma.amountToReturn = function(options) {
  var self = {
    disabledClass: 'disabled',
    init: function(options) {
      self.item = options.item;
      self.qtyInput = options.qtyInput;
      self.quantityRma = self.qtyInput.val();
      self.productPrice = options.priceInput;
      self.btns = options.btns;
      self.itemId = self.item.data('item-id');
      self.itemSku = self.item.data('item-sku');
      self.data = {
        id: self.itemId,
        sku: self.itemSku,
        amount: self.quantityRma,
      };
      self.url = self.item.data('url');

      self.beforeRequest();
      self.getProductPrice();
    },

    getProductPrice: function() {
      // pobierane dane z code/local/Acc/Rma/controllers/CustomerController.php calculatePriceAmount()
      LegacyBridge.fetchData(self.url, self.data, 'get')
        .then(function(response) {
          return response.json();
        })
        .then(function(response) {
          self.setProductPrice(response);
          self.afterRequest();
        })
        .catch(function(err) {
          console.error(err);
          self.afterRequest(err);
        });
    },

    setProductPrice: function(data) {
      if (data.status === 'success') {
        self.productPrice.html(data.price);
      }
    },

    beforeRequest: function() {
      var iterate = 0;
      self.qtyInput.disabled = true;
      for (iterate; iterate < self.btns.length; iterate++) {
        self.btns[iterate].disabled = true;
        self.btns[iterate].classList.add(self.disabledClass);
      }
    },

    afterRequest: function() {
      var iterate = 0;
      self.qtyInput.disabled = false;
      for (iterate; iterate < self.btns.length; iterate++) {
        self.btns[iterate].disabled = false;
        self.btns[iterate].classList.remove(self.disabledClass);
      }
    },
  };

  self.init(options);

  return self;
};

LPP.common.rma.validateRussianAccountNumber = (function() {
  var self = {
    init: function(options) {
      if (!LPP.common.rma.validateRussianAccountNumberEnabled) {
        return;
      }

      return self.checkWeightNumber(options.accountNumberId, options.bikId);
    },

    checkWeightNumber: function(accountNumber, bik) {
      var crc = self.weightsFactor(accountNumber, bik).reduce(function(prevCell, nextCell) {
        return prevCell + nextCell;
      });

      return crc % 10 === 0;
    },

    weightsFactor: function(accountNumber, bik) {
      var mask = [7, 1, 3],
        rccNumber = self.checkRccNumber(bik),
        accNumber = self.checkSixthSign(accountNumber);

      return [
        rccNumber[0] * mask[0],
        rccNumber[1] * mask[1],
        rccNumber[2] * mask[2],
        accNumber[0] * mask[0],
        accNumber[1] * mask[1],
        accNumber[2] * mask[2],
        accNumber[3] * mask[0],
        accNumber[4] * mask[1],
        accNumber[5] * mask[2],
        accNumber[6] * mask[0],
        accNumber[7] * mask[1],
        accNumber[8] * mask[2],
        accNumber[9] * mask[0],
        accNumber[10] * mask[1],
        accNumber[11] * mask[2],
        accNumber[12] * mask[0],
        accNumber[13] * mask[1],
        accNumber[14] * mask[2],
        accNumber[15] * mask[0],
        accNumber[16] * mask[1],
        accNumber[17] * mask[2],
        accNumber[18] * mask[0],
        accNumber[19] * mask[1],
      ];
    },

    checkRccNumber: function(bik) {
      var cco = bik.substr(-3, 3),
        pkc = 0;

      if (cco === '000') {
        pkc = bik.substr(4, 2);
        return [parseInt(pkc[0]), 0, parseInt(pkc[1])];
      }

      return [parseInt(cco[0]), parseInt(cco[1]), parseInt(cco[2])];
    },

    checkSixthSign: function(accountNumber) {
      var conversionObjectForSixthSign = {
          A: 0,
          B: 1,
          C: 2,
          E: 3,
          H: 4,
          K: 5,
          M: 6,
          P: 7,
          T: 8,
          X: 9,
        },
        sixthSign = accountNumber.charAt(5),
        numberForSixthSign = conversionObjectForSixthSign[sixthSign.toUpperCase()];

      if (isNaN(sixthSign)) {
        if (!numberForSixthSign) {
          return false;
        }
        return accountNumber.replace(sixthSign, numberForSixthSign);
      }
      return accountNumber;
    },
  };

  return self;
})();

LPP.common.sales.order.history.getOrderDetails = function(url, id, callback) {
    LegacyBridge.fetchData((LPP.common.baseUrl + url), {order_id: id}, 'get')
        .then(function(response) {
            if (!response.ok) {
                throw new Error(response.message);
            }
            callback(response);
        })
        .catch(function(error) {
            console.error(error);
        });
};

/**
 *
 * @param {Object} options
 * @param {string} [options.parentSelector = '.main-content']
 * @param {string} [options.spinnerId = 'spinner']
 * @param {string} [options.spinnerClass = 'spinner-wrapper']
 * @param {string} [options.sizeClass = '']
 * @param {boolean} [options.keepContent = false]
 * @param {boolean} [options.withModal = false]
 * @param {string} [options.headerText]
 */

(function() {
  function isVisible(el) {
    const style = window.getComputedStyle(el, null);
    return style.display !== 'none' && style.visibility === 'visible';
  }

  var promise;
  window.LPP.common.openSpinner = function(options) {
    var spinnerElement,
      spinnerClass,
      spinnerTemplateUrl,
      sizeClass,
      parentSelector,
      keepContent,
      withModal,
      headerText,
      parent,
      spinnerVariablesObject;

    spinnerElement = document.createElement('div');
    spinnerClass = options.spinnerClass || 'spinner-wrapper';
    spinnerTemplateUrl = LPP.common.getSpinnerTemplateUrl();
    sizeClass = options.sizeClass || 'normal';
    parentSelector = options.parentSelector || 'body';
    keepContent = options.keepContent || false;
    withModal = options.withModal || false;
    headerText = options.headerText || '';
    parent = document.querySelector(parentSelector);
    spinnerVariablesObject = {
      isHeaderVisible: headerText !== '',
      headerText: headerText,
    };

    spinnerElement.id = options.spinnerId || 'spinner';
    spinnerElement.classList.add(spinnerClass);
    spinnerElement.classList.add(sizeClass);

    return (promise = new Promise(function(resolve, reject) {
      LPP.common
        .setMustacheTemplate(spinnerElement, spinnerTemplateUrl, spinnerVariablesObject)
        .then(function() {
          if (parent.style.position !== 'fixed' && parent.style.position !== 'absolute') {
            parent.style.position = 'relative';
          }

          if (keepContent) {
            parent.insertBefore(spinnerElement, parent.firstChild);
          } else {
            parent.innerHTML = '';
            parent.appendChild(spinnerElement);
          }

          // rzeźba pod mobilne safari :(
          setTimeout(function() {
            const timer = setInterval(function() {
              if (isVisible(spinnerElement)) {
                clearInterval(timer);
                promise = null;
                resolve(true);
              }
            }, 55);
          }, 1000);

          if (withModal) {
            spinnerElement.classList.add('modal');
          }
        })
        .catch(function() {
          reject('Spinner error!');
        });
    }));
  };

  /**
   *
   * @param {Object} options
   * @param {string} [options.errorMessage = '']
   * @param {string} [options.infoHeaderSelector = '.info-header']
   * @param {string} [options.spinnerId = 'spinner']
   */
  window.LPP.common.closeSpinner = function(options) {
    options = options || {};
    var errorMessage = options.errorMessage || '',
      infoHeaderSelector = options.infoHeaderSelector || '.info-header',
      spinnerId = options.spinnerId || 'spinner',
      timeout = 0,
      fadeOutTime = typeof options.fadeOutTime === 'number' ? options.fadeOutTime : 400,
      spinner = document.getElementById(spinnerId),
      infoHeader = spinner ? spinner.querySelector(infoHeaderSelector) : '';

    if (!spinner) {
      return;
    }

    if (errorMessage && infoHeader) {
      timeout = 5000;
      infoHeader.innerHTML = errorMessage;
    }

    if (!timeout && !fadeOutTime) {
      if (spinner.parentNode) {
        spinner.parentNode.removeChild(spinner);
      }
      return;
    }

    setTimeout(function() {
      spinner.classList.add('fade-out');

      setTimeout(function() {
        if (spinner.parentNode) {
          spinner.parentNode.removeChild(spinner);
        }
      }, fadeOutTime);
    }, timeout);
  };

  window.LPP.common.getSpinnerTemplateUrl = function() {
    var brandName = LPP.common.brandName.toLowerCase(),
      localSpinnerTemplateUrl = LPP[brandName].spinnerTemplateUrl;

    if (typeof localSpinnerTemplateUrl !== 'undefined') {
      return localSpinnerTemplateUrl;
    }
    return LPP.common.spinnerTemplateUrl;
  };
})();

var rodoPopupActions = {
  init: function() {
    this.rodoPopupOverlay = document.getElementById('rodoPopupOverlay');
    this.submitButton = document.getElementById('rodoSubmit');
    this.closeButton = this.rodoPopupOverlay.querySelector('.close-button');
    this.url = this.submitButton.dataset.url;
    this.actions();
    this.rodoPopupOverlay.style.display = 'block';
    if (typeof jQuery.mCustomScrollbar === 'function') {
      jQuery('#rodoPolicyContent').mCustomScrollbar();
    }
  },
  url: '',
  rodoPopupOverlay: null,
  submitButton: null,
  closeButton: null,
  actions: function() {
    this.overlayClose();
    document.addEventListener('keyup', this.escClose.bind(this));
    this.closeButton.addEventListener('click', this.closePopup.bind(this));
    this.submitButton.addEventListener('click', this.sendData.bind(this));
  },
  overlayClose: function() {
    window.onclick = function(event) {
      if (event.target === this.rodoPopupOverlay) {
        this.closePopup();
      }
    }.bind(this);
  },
  escClose: function(event) {
    if (event.key === 'Escape') {
      this.closePopup();
    }
  },
  closePopup: function() {
    this.rodoPopupOverlay.style.display = 'none';
    window.onclick = null;
    document.removeEventListener('keyup', this.escClose);
    this.closeButton.removeEventListener('click', this.closePopup);
    this.submitButton.removeEventListener('click', this.sendData);
  },
  sendData: function() {
    LegacyBridge.fetchData(this.url, 'accept_privacy=1', 'post')
      .then(function(response) {
        return response.json();
      })
      .then(
        function(json) {
          if (json.status) {
            this.closePopup();
          }
        }.bind(this)
      )
      .catch(function(err) {
        // brak obsługi błędów
      });
  },
};

LPP.common.checkout.postcodeAutocomplete = (function() {
  var self = {
    loadingClass: 'loading',
    warningClass: 'warning',
    init: function(options) {
      if (!LPP.common.checkout.postcodeAutocompleteEnabled) {
        return;
      }

      self.cityInput = document.getElementById(options.cityInputId);
      self.streetInput = document.getElementById(options.streetInputId);
      self.buildingNumberInput = document.getElementById(options.buildingNumberInputId);
      self.postcodeInput = document.getElementById(options.postcodeInputId);

      if (!self.cityInput || !self.streetInput || !self.buildingNumberInput || !self.postcodeInput) {
        return;
      }

      self.hasParentValidationClass = options.hasParentValidationClass;

      self.autocompletedPostcode = self.postcodeInput.value;
      self.postcodeInputParent = self.postcodeInput.parentNode;

      self.beforeRequestCustom = options.beforeRequestCustom || function() {};
      self.afterRequestCustom = options.afterRequestCustom || function() {};
      self.openPopup = options.openPopup;
      self.closePopup = options.closePopup;

      self.cityInput.addEventListener('focus', self.setTempInputValue);
      self.streetInput.addEventListener('focus', self.setTempInputValue);
      self.buildingNumberInput.addEventListener('focus', self.setTempInputValue);

      self.cityInput.addEventListener('blur', self.getPostCodeIfRequiredFieldsNotEmpty);
      self.streetInput.addEventListener('blur', self.getPostCodeIfRequiredFieldsNotEmpty);
      self.buildingNumberInput.addEventListener('blur', self.getPostCodeIfRequiredFieldsNotEmpty);
    },

    setTempInputValue: function(event) {
      self.tempInputValue = event.target.value;
    },

    getPostCodeIfRequiredFieldsNotEmpty: function(event) {
      if (
        !self.cityInput.value ||
        !self.streetInput.value ||
        !self.buildingNumberInput.value ||
        (!self.inputValueHasBeenChanged(event.target.value) &&
          (!self.autocompletedPostcode || self.autocompletedPostcode === self.postcodeInput.value))
      ) {
        return;
      }

      if (event.relatedTarget && 'checkoutsubmit' in event.relatedTarget.dataset && self.postcodeInput.value) {
        return;
      }

      self.beforeRequest();
      self.beforeRequestCustom();

      self
        .getPostcodeAndValidateAddress({
          city: self.cityInput.value,
          street: self.streetInput.value,
          house: self.buildingNumberInput.value,
        })
        .then(function(address) {
          self.afterRequest();
          self.afterRequestCustom();
          if (address) {
            self.completePostcode(address);
          }
        });
    },

    inputValueHasBeenChanged: function(newValue) {
      return newValue !== self.tempInputValue;
    },

    getPostcodeAndValidateAddress: function(address) {
      var city = address.city || '',
        street = address.street || '',
        house = address.house || '';

      return fetch(LPP.common.checkout.getPostcodeAndValidateAddressUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'address=' + city + ' ' + street + ' ' + house,
      })
        .then(function(response) {
          return response.json();
        })
        .then(self.processApiResponse);
    },

    processApiResponse: function(json) {
      if (!json[0]) {
        return;
      }

      var response = json[0],
        mapQualityCodeToTranslationKey = {
          UNDEF_01: 'incorrect_city',
          UNDEF_02: 'incorrect_city',
          UNDEF_03: 'incorrect_street',
          UNDEF_04: 'incorrect_house',
          UNDEF_05: 'incorrect_apartment',
          UNDEF_06: 'foreign_address',
        },
        qualityCode = response['quality-code'],
        translationKey;

      if (qualityCode === 'GOOD') {
        return response;
      }

      translationKey = mapQualityCodeToTranslationKey[qualityCode];

      if (!translationKey) {
        response.errorMessage = global.i18n['incorrect_address'];
      } else {
        response.errorMessage = global.i18n[translationKey];
      }
      return response;
    },

    beforeRequest: function() {
      self.postcodeInput.disabled = true;
      self.postcodeInputParent.classList.add(self.loadingClass);
    },

    afterRequest: function() {
      self.postcodeInput.value = '';
      self.postcodeInput.disabled = false;
      self.postcodeInputParent.classList.remove(self.loadingClass);
    },

    completePostcode: function(address) {
      if (address.index) {
        self.autocompletedPostcode = address.index;
        self.postcodeInput.value = address.index;
        jQuery(self.postcodeInput).valid();
      }
      if (address.errorMessage) {
        var input = self.mapQualityCodeToInput(address['quality-code']);
        self.setInputHasWarning(input);
      }
      if (!self.isUserCityAndStreetCorrect(address) && address.place && address.street) {
        self.showTypoInAddressPopup(address);
      } else {
        if (address.errorMessage) {
          self.openPopup(address.errorMessage);
        }
      }
    },

    mapQualityCodeToInput: function(qualityCode) {
      var mapQualityCodeToInput = {
        UNDEF_01: self.cityInput,
        UNDEF_02: self.cityInput,
        UNDEF_03: self.streetInput,
        UNDEF_04: self.buildingNumberInput,
        UNDEF_05: self.buildingNumberInput,
      };

      return mapQualityCodeToInput[qualityCode];
    },

    setInputHasWarning: function(input) {
      if (input) {
        var validationClassContainer = self.hasParentValidationClass ? input.parentElement : input;
        validationClassContainer.classList.add(self.warningClass);
      }
    },

    showTypoInAddressPopup: function(address) {
      fetch(LPP.common.checkout.postcodeAutocompletePopupTemplateUrl)
        .then(function(response) {
          return response.text();
        })
        .then(function(template) {
          var popupContent = Mustache.render(template, {
            city: address.place,
            street: address.street,
            house: address.house,
            slash: address.slash ? '/' + address.slash : '',
            room: address.room,
            title: global.i18n.typo_in_address,
            question: global.i18n.did_you_mean_address_below,
            yes: global.i18n.yes,
            no: global.i18n.no,
          });

          self.openPopup(popupContent);
          document.getElementById('correctAddress').addEventListener('click', self.fixAddress.bind(self, address));
          document.getElementById('closeAddressCorrectionModal').addEventListener('click', self.closePopup);
        });
    },

    isUserCityAndStreetCorrect: function(address) {
      var userCity = self.cityInput.value,
        userStreet = self.streetInput.value;
      return (
        address.place &&
        address.place.split(' ')[1] === userCity.trim().split(' ')[0] &&
        address.street &&
        address.street.split(' ')[1] === userStreet.trim().split(' ')[0]
      );
    },

    fixAddress: function(address) {
      self.cityInput.value = address.place.slice(address.place.indexOf(' ') + 1);
      self.streetInput.value =
        address.street.indexOf('ул') !== -1 ? address.street.slice(address.street.indexOf(' ') + 1) : address.street;

      jQuery(self.cityInput).valid();
      jQuery(self.streetInput).valid();

      self.closePopup();
    },
  };

  return self;
})();

/**
 * @type {{init: LPP.common.togglePasswordField.init, findToggleWrapper: (function(): (NodeListOf<HTMLElementTagNameMap[string]> | NodeListOf<SVGElementTagNameMap[string]> | NodeListOf<Element>)), getInput: (function(HTMLElement): *), getSwitcher: (function(HTMLElement): *), bindToggle: LPP.common.togglePasswordField.bindToggle, toggle: LPP.common.togglePasswordField.toggle}}
 */
LPP.common.togglePasswordField = {
  init: function() {
    var wrappersPassword = this.findToggleWrapper();
    this.bindToggle(wrappersPassword);
  },
  /**
   * @return {NodeListOf<HTMLElementTagNameMap[string]> | NodeListOf<SVGElementTagNameMap[string]> | NodeListOf<Element>}
   */
  findToggleWrapper: function() {
    return document.querySelectorAll('.password-toggle');
  },
  /**
   * @param  {HTMLElement} wrapper
   */
  getInput: function(wrapper) {
    return wrapper.querySelector('[type="password"]');
  },
  /**
   * @param {HTMLElement} wrapper
   */
  getSwitcher: function(wrapper) {
    return wrapper.querySelector('.show-label');
  },
  /**
   *
   * @param {NodeList} wrappersNodes
   */
  bindToggle: function(wrappersNodes) {
    var nodeIndex, node, input, switcher;

    for (nodeIndex in wrappersNodes) {
      if (wrappersNodes.hasOwnProperty(nodeIndex)) {
        node = wrappersNodes[nodeIndex];
        input = this.getInput(node);
        switcher = this.getSwitcher(node);

        switcher.addEventListener('click', this.toggle.bind(null, input, switcher));
      }
    }
  },
  /**
   *
   * @param {HTMLInputElement} input
   * @param {HTMLSpanElement} switcher
   */
  toggle: function(input, switcher) {
    var shouldHide = switcher.textContent === switcher.dataset.hide;
    switcher.textContent = shouldHide ? switcher.dataset.show : switcher.dataset.hide;
    input.type = shouldHide ? 'password' : 'text';
  },
};

LPP.common.disablePasteForField = {
  wasPaste: false,
  /**
   * @param {string} confirmationId
   * @param {object} [extraConfig={}] - key → value pair where 'key' is the attribute name and 'value' is the attribute value
   * ex. { id: 'objectId', class: 'new object-classes' }
   * existing attributes will be overwritten by extraConfig
   */
  init: function(confirmationId, extraConfig) {
    var confirmation = document.getElementById(confirmationId);
    extraConfig = extraConfig || {};

    if (confirmation) {
      confirmation.addEventListener('paste', this.pasteEventListener.bind(this, confirmationId, extraConfig));
      confirmation.addEventListener('keyup', this.keyupEventListener.bind(this));
    }
  },
  /**
   * @param {string} confirmationId
   * @param {object} extraConfig
   * @param {UIEvent} event
   */
  pasteEventListener: function(confirmationId, extraConfig, event) {
    var nextSibling = event.target.nextElementSibling,
      label = nextSibling;

    this.wasPaste = true;

    if (!nextSibling || nextSibling.getAttribute('for') !== confirmationId) {
      label = document.createElement('label');
    }

    label.classList.add('error');
    label.textContent = global.i18n.input_paste_disable;
    label.setAttribute('for', confirmationId);

    this.setExtraConfigToElement(label, extraConfig);

    event.target.parentNode.insertBefore(label, nextSibling);

    event.preventDefault();
    event.target.classList.add('error');
  },
  /**
   * @param {UIEvent} event
   */
  keyupEventListener: function(event) {
    if (this.wasPaste) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!event.ctrlKey) {
      this.wasPaste = false;
    }
  },
  /**
   * @param {HTMLElement} element
   * @param {Object} config
   */
  setExtraConfigToElement: function(element, config) {
    Object.keys(config).forEach(function(property) {
      var value = config[property];

      element.setAttribute(property, value);
    });
  },
};

LPP.common.formSelect = function(selectEl, changeCallback, customStruct) {
  this.selectEl = selectEl;
  this.changeCallback = changeCallback;
  this.isDesktop = true;
  var self = this;

  if (!customStruct && !LegacyBridge.getStoreConfig('geoValidation/enabled')) {
    return;
  }

  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Trident|Opera Mini/i.test(navigator.userAgent)) {
    this.isDesktop = false;

    if (customStruct) {
      this.selectEl.addEventListener('change', function(evt) {
        self.changeCallback(evt.target.value);
      });
      this.changeCallback(this.selectEl.value);
    }
  } else {
    this.createOverlay(customStruct);
  }
};

LPP.common.formSelect.prototype.createOverlay = function(customStruct) {
  var self = this;
  this.selectEl.style.display = 'none';
  this.selectEl.classList.add('hidden');
  this.selectedElement = document.createElement('div');
  this.optionsList = document.createElement('div');
  this.selector = document.createElement('div');
  this.selector.className = 'lppFormSelect ' + this.selectEl.className;
  this.selector.classList.remove('hidden');
  this.showOptions = this.showOptions.bind(this);
  this.closeByClickOutside = this.closeByClickOutside.bind(this);
  this.onChange = this.onChange.bind(this);
  this.clearCurrent = this.clearCurrent.bind(this);
  this.customStruct = customStruct;

  this.optionsList.classList.add('options');
  this.selectedElement.classList.add('selected');

  for (var index in this.selectEl.options) {
    var option = this.selectEl.options[index],
      newOption = document.createElement('div');

    if (option && option.innerHTML) {
      newOption.classList.add('option');
      newOption.setAttribute('value', !customStruct ? option.innerText : option.value);
      newOption.insertAdjacentHTML('afterbegin', option.innerHTML);
      newOption.addEventListener('click', function(event) {
        self.selectOption(event, this);
      });
      this.optionsList.appendChild(newOption);
    }
  }

  this.selector.appendChild(this.selectedElement);
  this.selector.appendChild(this.optionsList);

  this.selectEl.parentNode.insertBefore(this.selector, this.selectEl);

  this.selectedElement.innerHTML = !!this.customStruct
    ? this.selectEl.options[this.selectEl.selectedIndex].innerHTML
    : this.selectEl.value;
  this.selectedElement.setAttribute(
    'value',
    !!this.customStruct ? this.selectEl.options[this.selectEl.selectedIndex].value : this.selectEl.value
  );
  if (!!this.customStruct) {
    this.changeCallback(this.selectEl.options[this.selectEl.selectedIndex].value);
  }
  this.selectedElement.addEventListener('click', this.showOptions);
  this.selectEl.addEventListener('change', this.onChange);
  document.addEventListener('click', this.closeByClickOutside);
};

LPP.common.formSelect.prototype.closeByClickOutside = function(event) {
  var isClickInside = this.selector.contains(event.target);

  if (!isClickInside) {
    this.hideOptions();
  }
};

LPP.common.formSelect.prototype.clearCurrent = function() {
  var current = this.optionsList.getElementsByClassName('current');
  if (!!current.length) {
    current[0].classList.remove('current');
  }
};

LPP.common.formSelect.prototype.onChange = function() {
  this.selectedElement.innerText = !!this.customStruct ? this.selectEl.innerHTML : this.selectEl.value;
};

LPP.common.formSelect.prototype.showOptions = function() {
  this.optionsList.classList.add('active');
  this.selector.classList.add('active');
};

LPP.common.formSelect.prototype.hideOptions = function() {
  this.optionsList.classList.remove('active');
  this.selector.classList.remove('active');
};

LPP.common.formSelect.prototype.selectOption = function(event, option) {
  event.stopPropagation();
  this.clearCurrent();
  option.classList.add('current');

  this.changeCallback(!!this.customStruct ? option.getAttribute('value') : event.target.getAttribute('value'));
  this.selectedElement.innerHTML = option.innerHTML;
  this.hideOptions();
};

LPP.common.formSelect.prototype.changeValue = function(value) {
  this.selectedElement.innerHTML = value;
};

LPP.common.formSelect.prototype.disable = function(isDisabled) {
  if (!LegacyBridge.getStoreConfig('geoValidation/enabled')) {
    return;
  }

  if (this.isDesktop) {
    this.selectedElement.innerHTML = !!this.customStruct ? this.selectEl.innerHTML : this.selectEl.value;
    this.selector.classList.remove('disabled');
    if (isDisabled) {
      this.selector.classList.add('disabled');
    }
  }
};

LPP.common.tooltip = function(tooltipElId, tooltipText, customClass) {
    this.createOverlay(tooltipElId, tooltipText, customClass);
};

LPP.common.tooltip.prototype.createOverlay = function(tooltipElId, tooltipText, customClass) {
    if (this.tooltipCreated) {
        return;
    }

    this.tooltipElement = document.getElementById(tooltipElId);

    if (!this.tooltipElement) {
        return;
    }

    this.tooltipElement.classList.add(!!customClass ? customClass : 'validationTooltip');

    while (this.tooltipElement.firstChild) {
        this.tooltipElement.removeChild(this.tooltipElement.firstChild);
    }

    this.tooltipElement.appendChild(this.createElWithClass('div', 'toolTipContent', tooltipText));
    this.tooltipEnter = this.tooltipEnter.bind(this);
    this.tooltipLeave = this.tooltipLeave.bind(this);

    this.tooltipElement.addEventListener('mouseover', this.tooltipEnter, false);
    this.tooltipElement.addEventListener('mouseleave', this.tooltipLeave, false);
    this.tooltipCreated = true;
};

LPP.common.tooltip.prototype.appendChild = function (elementsList, errorElements, appendTo) {
    elementsList.forEach(function(elementName) {
        errorElements[appendTo].appendChild(errorElements[elementName]);
    })
};

LPP.common.tooltip.prototype.createElWithClass = function (tag, elementClass, text) {
    var newElement = document.createElement(tag);

    if (elementClass) {
        newElement.classList.add(elementClass);
    }

    if (text) {
        newElement.innerHTML = text;
    }

    return newElement;
};

LPP.common.tooltip.prototype.tooltipEnter = function() {
    this.tooltipElement.classList.add('active');
};

LPP.common.tooltip.prototype.setContent = function(content) {
    this.tooltipElement.childNodes[0].innerText = content;
};

LPP.common.tooltip.prototype.tooltipLeave = function() {
    this.tooltipElement.classList.remove('active');
};
if (!LPP.common) {
  LPP.common = {};
}

LPP.common.GeoValidation = function(
  defaultRules,
  useDefaultRules,
  formValidation,
  phoneConfig,
  preventCloseEl,
  addinationalFields,
  usePhoneExact
) {
  var that = this;
  this.enabled = LegacyBridge.getStoreConfig('geoValidation/enabled');
  this.commonPattern = LegacyBridge.getStoreConfig('geoValidation/commonPattern');
  this.defaultPhone = LegacyBridge.getStoreConfig('geoValidation/defaultDialCode');
  this.phonePattern = LegacyBridge.getStoreConfig('geoValidation/phonePattern');
  this.postCodePattern = LegacyBridge.getStoreConfig('geoValidation/postCodePattern');
  this.fields = formValidation;
  this.additionalRules = {};
  this.defaultRules = jQuery.extend(true, {}, defaultRules);
  this.changePhoneRule = this.changePhoneRule.bind(this);
  this.closeByClickOutside = this.closeByClickOutside.bind(this);
  this.changeCallback = this.changeCallback.bind(this);
  this.useDefaultRules = useDefaultRules;
  this.preventCloseEl = preventCloseEl;
  this.addinationalFields = addinationalFields;
  this.usePhoneExact = usePhoneExact;
  this.tooltipCourierText = LegacyBridge.getStoreConfig('geoValidation/tooltipCourierText');
  this.tooltipPickupText = LegacyBridge.getStoreConfig('geoValidation/tooltipText');

  if (phoneConfig) {
    this.phoneConfig = phoneConfig;
    if (!this.formSelect && this.phoneConfig.dialCodeEl) {
      this.formSelect = new LPP.common.formSelect(this.phoneConfig.dialCodeEl, this.changeCallback);
    }
  }

  if (!useDefaultRules && this.enabled) {
    this.fields.forEach(function(ruleValidation) {
      that.additionalRules[ruleValidation.field] = that.commonPattern;
      that.additionalRules[ruleValidation.field].normalizer = function(value) {
        return value.replace(/^\s+|\s+$/g, '');
      };

      if (ruleValidation.validator === 'postcode') {
        that.additionalRules[ruleValidation.field] = Object.assign({}, that.commonPattern, that.postCodePattern);
      }
    });

    return this;
  }

  this.fields.forEach(function(ruleValidation) {
    that.additionalRules[ruleValidation.field] = that.defaultRules[ruleValidation.validator];
  });

  return this;
};

LPP.common.GeoValidation.prototype.additionalRules = {};
LPP.common.GeoValidation.prototype.phoneConfig = {};
LPP.common.GeoValidation.prototype.fields = {};
LPP.common.GeoValidation.prototype.defaultRules = {};

LPP.common.GeoValidation.prototype.getRules = function() {
  return this.additionalRules;
};

LPP.common.GeoValidation.prototype.changeCallback = function(value) {
  this.phoneConfig.dialCodeEl.value = value;
  this.changePhoneRule();
};

LPP.common.GeoValidation.prototype.changePhoneRule = function() {
  if (!this.enabled) {
    return;
  }
  if (!this.preventChangeRule) {
    this.changeRuleTo(this.validator, this.phoneConfig.dialCodeEl.value == this.defaultPhone);
  }

  if (this.phoneConfig.phoneEl.value.length) {
    this.validator.element(this.phoneConfig.phoneElName);
  }
};

LPP.common.GeoValidation.prototype.changeRuleTo = function(validator, isDefaultValidation) {
  if (!this.enabled) {
    return;
  }

  jQuery(this.phoneConfig.phoneElName).rules('remove');

  if (isDefaultValidation) {
    jQuery(this.phoneConfig.phoneElName).rules(
      'add',
      this.usePhoneExact ? this.defaultRules.phone_exact : this.defaultRules.phone
    );
  } else {
    jQuery(this.phoneConfig.phoneElName).rules('add', this.phonePattern);
  }
};

LPP.common.GeoValidation.prototype.checkValidation = function(validator) {
  this.closeError();
  this.validator = validator;
  this.fields.forEach(function(ruleValidation) {
    var fieldEl = document.getElementsByName(ruleValidation.field)[0];

    if (fieldEl && fieldEl.value) {
      validator.element('[name="' + ruleValidation.field + '"]');
    }
  });

  if (this.phoneConfig && this.phoneConfig.dialCodeEl && this.phoneConfig.phoneEl) {
    this.changePhoneRule(validator);

    this.phoneConfig.dialCodeEl.onchange = function(el) {
      this.changePhoneRule(validator);
    }.bind(this);
  }
};

LPP.common.GeoValidation.prototype.appendChild = function(elementsList, errorElements, appendTo) {
  elementsList.forEach(function(elementName) {
    errorElements[appendTo].appendChild(errorElements[elementName]);
  });
};

LPP.common.GeoValidation.prototype.createElWithClass = function(tag, elementClass, text) {
  var newElement = document.createElement(tag);

  if (elementClass) {
    newElement.classList.add(elementClass);
  }

  if (text) {
    newElement.innerHTML = text;
  }

  return newElement;
};

LPP.common.GeoValidation.prototype.displayError = function() {
  var errorElements = {
      WrapperEl: this.createElWithClass('div', 'validation-global-error'),
      TextWrapperEl: this.createElWithClass('div', 'validation-text-wrapper'),
      TextEl: this.createElWithClass('span', false, LegacyBridge.getStoreConfig('geoValidation/contactText')),
      InfoIconEl: this.createElWithClass('div', 'info-icon'),
      CloseEl: this.createElWithClass('div', 'close-button'),
      EmptyEl: this.createElWithClass('div', 'empty-spacing'),
    },
    self = this;

  this.errWrapper = document.getElementById('validationInvoiceError');

  if (this.errWrapper) {
    this.errWrapper.style.display = '';
    return;
  }

  if (!this.enabled) {
    return;
  }

  this.appendChild(['InfoIconEl', 'TextEl'], errorElements, 'TextWrapperEl');
  this.appendChild(['EmptyEl', 'TextWrapperEl', 'CloseEl'], errorElements, 'WrapperEl');
  this.errWrapper = errorElements.WrapperEl;

  this.errWrapper.id = 'validationInvoiceError';
  document.body.appendChild(this.errWrapper);

  errorElements.CloseEl.addEventListener(
    'click',
    function(event) {
      self.closeError();
    },
    false
  );

  document.addEventListener('click', self.closeByClickOutside);
};

LPP.common.GeoValidation.prototype.tryDisplayError = function(errors) {
  var hasError = false,
    self = this;

  if (!this.useDefaultRules) {
    return;
  }

  Object.keys(errors).forEach(function(k) {
    if (
      (errors[k] && self.getRulesFieds().includes(k)) ||
      (errors[k] && self.addinationalFields && self.addinationalFields.includes(k))
    ) {
      hasError = true;
      return;
    }
  });

  if (hasError) {
    this.displayError();
  } else {
    this.closeError();
  }
};

LPP.common.GeoValidation.prototype.closeByClickOutside = function(event) {
  var isClickInside = this.errWrapper.contains(event.target);

  if (
    !isClickInside &&
    this.preventCloseEl &&
    this.errWrapper.style.display == '' &&
    window.innerWidth < 768 &&
    !event.target.matches(this.preventCloseEl + ', ' + this.preventCloseEl + ' *')
  ) {
    this.closeError();
  }
};

LPP.common.GeoValidation.prototype.closeError = function() {
  if (this.errWrapper) {
    this.errWrapper.style.display = 'none';
  }
};

LPP.common.GeoValidation.prototype.createTooltip = function() {
  if (this.tooltipCreated || !this.enabled) {
    return;
  }

  this.tooltipElement = document.getElementById('geoValidationTooltip');

  if (!this.tooltipElement) {
    return;
  }

  this.tooltipElement.classList.add('validationTooltip');
  while (this.tooltipElement.firstChild) {
    this.tooltipElement.removeChild(this.tooltipElement.firstChild);
  }

  this.tooltipElement.appendChild(this.createElWithClass('div', 'toolTipContent'));
  this.tooltipEnter = this.tooltipEnter.bind(this);
  this.tooltipLeave = this.tooltipLeave.bind(this);

  this.tooltipElement.addEventListener('mouseover', this.tooltipEnter, false);
  this.tooltipElement.addEventListener('mouseleave', this.tooltipLeave, false);
  this.tooltipCreated = true;
};

LPP.common.GeoValidation.prototype.courierTooltip = function(isCourierTooltip) {
  var tooltipContentWrapper = this.tooltipElement.childNodes[0];
  tooltipContentWrapper.innerText = isCourierTooltip ? this.tooltipCourierText : this.tooltipPickupText;
};

LPP.common.GeoValidation.prototype.tooltipEnter = function() {
  this.tooltipElement.classList.add('active');
};

LPP.common.GeoValidation.prototype.tooltipLeave = function() {
  this.tooltipElement.classList.remove('active');
};

LPP.common.GeoValidation.prototype.getRulesFieds = function() {
  return Object.keys(this.additionalRules);
};

var lppDoJo = (function(lppNamespace) {
  lppNamespace.arrayUtils = {
    filter: function(arr, callback, thisObject) {
      // summary:
      //		Returns a new Array with those items from arr that match the
      //		condition implemented by callback.
      // arr: Array
      //		the array to iterate over.
      // callback: Function|String
      //		a function that is invoked with three arguments (item,
      //		index, array). The return of this function is expected to
      //		be a boolean which determines whether the passed-in item
      //		will be included in the returned array.
      // thisObject: Object?
      //		may be used to scope the call to callback
      // returns: Array
      // description:
      //		This function corresponds to the JavaScript 1.6 Array.filter() method, with one difference: when
      //		run over sparse arrays, this implementation passes the "holes" in the sparse array to
      //		the callback function with a value of undefined. JavaScript 1.6's filter skips the holes in the sparse array.
      //		For more details, see:
      //		https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/filter
      // example:
      //	| // returns [2, 3, 4]
      //	| array.filter([1, 2, 3, 4], function(item){ return item>1; });
      // TODO: do we need "Ctr" here like in map()?
      var i = 0,
        l = (arr && arr.length) || 0,
        out = [],
        value;
      if (l && typeof arr == 'string') arr = arr.split('');
      if (typeof callback == 'string') callback = cache[callback] || buildFn(callback);
      if (thisObject) {
        for (; i < l; ++i) {
          value = arr[i];
          if (callback.call(thisObject, value, i, arr)) {
            out.push(value);
          }
        }
      } else {
        for (; i < l; ++i) {
          value = arr[i];
          if (callback(value, i, arr)) {
            out.push(value);
          }
        }
      }
      return out; // Array
    },
  };

  return lppNamespace;
})(lppDoJo || {});

var lppDoJo = (function(lppNamespace) {
  var arrayUtils = lppNamespace.arrayUtils;

  var queryEngine = function(query, options) {
    // summary:
    //		Simple query engine that matches using filter functions, named filter
    //		functions or objects by name-value on a query object hash
    //
    // description:
    //		The SimpleQueryEngine provides a way of getting a QueryResults through
    //		the use of a simple object hash as a filter.  The hash will be used to
    //		match properties on data objects with the corresponding value given. In
    //		other words, only exact matches will be returned.
    //
    //		This function can be used as a template for more complex query engines;
    //		for example, an engine can be created that accepts an object hash that
    //		contains filtering functions, or a string that gets evaluated, etc.
    //
    //		When creating a new dojo.store, simply set the store's queryEngine
    //		field as a reference to this function.
    //
    // query: Object
    //		An object hash with fields that may match fields of items in the store.
    //		Values in the hash will be compared by normal == operator, but regular expressions
    //		or any object that provides a test() method are also supported and can be
    //		used to match strings by more complex expressions
    //		(and then the regex's or object's test() method will be used to match values).
    //
    // options: dojo/store/api/Store.QueryOptions?
    //		An object that contains optional information such as sort, start, and count.
    //
    // returns: Function
    //		A function that caches the passed query under the field "matches".  See any
    //		of the "query" methods on dojo.stores.
    //
    // example:
    //		Define a store with a reference to this engine, and set up a query method.
    //
    //	|	var myStore = function(options){
    //	|		//	...more properties here
    //	|		this.queryEngine = SimpleQueryEngine;
    //	|		//	define our query method
    //	|		this.query = function(query, options){
    //	|			return QueryResults(this.queryEngine(query, options)(this.data));
    //	|		};
    //	|	};

    // create our matching query function
    switch (typeof query) {
      default:
        throw new Error('Can not query with a ' + typeof query);
      case 'object':
      case 'undefined':
        var queryObject = query;
        query = function(object) {
          for (var key in queryObject) {
            var required = queryObject[key];
            if (required && required.test) {
              // an object can provide a test method, which makes it work with regex
              if (!required.test(object[key], object)) {
                return false;
              }
            } else if (required != object[key]) {
              return false;
            }
          }
          return true;
        };
        break;
      case 'string':
        // named query
        if (!this[query]) {
          throw new Error('No filter function ' + query + ' was found in store');
        }
        query = this[query];
      // fall through
      case 'function':
      // fall through
    }
    function execute(array) {
      // execute the whole query, first we filter
      var results = arrayUtils.filter(array, query);
      // next we sort
      var sortSet = options && options.sort;
      if (sortSet) {
        results.sort(
          typeof sortSet == 'function'
            ? sortSet
            : function(a, b) {
                for (var sort, i = 0; (sort = sortSet[i]); i++) {
                  var aValue = a[sort.attribute];
                  var bValue = b[sort.attribute];
                  // valueOf enables proper comparison of dates
                  aValue = aValue != null ? aValue.valueOf() : aValue;
                  bValue = bValue != null ? bValue.valueOf() : bValue;
                  if (aValue != bValue) {
                    return !!sort.descending == (aValue == null || aValue > bValue) ? -1 : 1;
                  }
                }
                return 0;
              }
        );
      }
      // now we paginate
      if (options && (options.start || options.count)) {
        var total = results.length;
        results = results.slice(options.start || 0, (options.start || 0) + (options.count || Infinity));
        results.total = total;
      }
      return results;
    }
    execute.matches = query;
    return execute;
  };

  lppNamespace.queryEngine = queryEngine;

  return lppNamespace;
})(lppDoJo || {});

var lppDoJo = (function(lppNamespace) {
  var Memory = function(args) {
    this.data = args.data;
  };

  Memory.prototype = {
    query: function(query, options) {
      return lppNamespace.queryEngine(query, options)(this.data);
    },
  };

  lppNamespace.Memory = Memory;

  return lppNamespace;
})(lppDoJo || {});

/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0; /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad = ''; /* base-64 pad character. "=" for strict RFC compliance   */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_md5(s) {
  return rstr2hex(rstr_md5(str2rstr_utf8(s)));
}
function b64_md5(s) {
  return rstr2b64(rstr_md5(str2rstr_utf8(s)));
}
function any_md5(s, e) {
  return rstr2any(rstr_md5(str2rstr_utf8(s)), e);
}
function hex_hmac_md5(k, d) {
  return rstr2hex(rstr_hmac_md5(str2rstr_utf8(k), str2rstr_utf8(d)));
}
function b64_hmac_md5(k, d) {
  return rstr2b64(rstr_hmac_md5(str2rstr_utf8(k), str2rstr_utf8(d)));
}
function any_hmac_md5(k, d, e) {
  return rstr2any(rstr_hmac_md5(str2rstr_utf8(k), str2rstr_utf8(d)), e);
}

/*
 * Perform a simple self-test to see if the VM is working
 */
function md5_vm_test() {
  return hex_md5('abc').toLowerCase() == '900150983cd24fb0d6963f7d28e17f72';
}

/*
 * Calculate the MD5 of a raw string
 */
function rstr_md5(s) {
  return binl2rstr(binl_md5(rstr2binl(s), s.length * 8));
}

/*
 * Calculate the HMAC-MD5, of a key and some data (raw strings)
 */
function rstr_hmac_md5(key, data) {
  var bkey = rstr2binl(key);
  if (bkey.length > 16) bkey = binl_md5(bkey, key.length * 8);

  var ipad = Array(16),
    opad = Array(16);
  for (var i = 0; i < 16; i++) {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5c5c5c5c;
  }

  var hash = binl_md5(ipad.concat(rstr2binl(data)), 512 + data.length * 8);
  return binl2rstr(binl_md5(opad.concat(hash), 512 + 128));
}

/*
 * Convert a raw string to a hex string
 */
function rstr2hex(input) {
  try {
    hexcase;
  } catch (e) {
    hexcase = 0;
  }
  var hex_tab = hexcase ? '0123456789ABCDEF' : '0123456789abcdef';
  var output = '';
  var x;
  for (var i = 0; i < input.length; i++) {
    x = input.charCodeAt(i);
    output += hex_tab.charAt((x >>> 4) & 0x0f) + hex_tab.charAt(x & 0x0f);
  }
  return output;
}

/*
 * Convert a raw string to a base-64 string
 */
function rstr2b64(input) {
  try {
    b64pad;
  } catch (e) {
    b64pad = '';
  }
  var tab = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var output = '';
  var len = input.length;
  for (var i = 0; i < len; i += 3) {
    var triplet =
      (input.charCodeAt(i) << 16) |
      (i + 1 < len ? input.charCodeAt(i + 1) << 8 : 0) |
      (i + 2 < len ? input.charCodeAt(i + 2) : 0);
    for (var j = 0; j < 4; j++) {
      if (i * 8 + j * 6 > input.length * 8) output += b64pad;
      else output += tab.charAt((triplet >>> (6 * (3 - j))) & 0x3f);
    }
  }
  return output;
}

/*
 * Convert a raw string to an arbitrary string encoding
 */
function rstr2any(input, encoding) {
  var divisor = encoding.length;
  var i, j, q, x, quotient;

  /* Convert to an array of 16-bit big-endian values, forming the dividend */
  var dividend = Array(Math.ceil(input.length / 2));
  for (i = 0; i < dividend.length; i++) {
    dividend[i] = (input.charCodeAt(i * 2) << 8) | input.charCodeAt(i * 2 + 1);
  }

  /*
   * Repeatedly perform a long division. The binary array forms the dividend,
   * the length of the encoding is the divisor. Once computed, the quotient
   * forms the dividend for the next step. All remainders are stored for later
   * use.
   */
  var full_length = Math.ceil((input.length * 8) / (Math.log(encoding.length) / Math.log(2)));
  var remainders = Array(full_length);
  for (j = 0; j < full_length; j++) {
    quotient = Array();
    x = 0;
    for (i = 0; i < dividend.length; i++) {
      x = (x << 16) + dividend[i];
      q = Math.floor(x / divisor);
      x -= q * divisor;
      if (quotient.length > 0 || q > 0) quotient[quotient.length] = q;
    }
    remainders[j] = x;
    dividend = quotient;
  }

  /* Convert the remainders to the output string */
  var output = '';
  for (i = remainders.length - 1; i >= 0; i--) output += encoding.charAt(remainders[i]);

  return output;
}

/*
 * Encode a string as utf-8.
 * For efficiency, this assumes the input is valid utf-16.
 */
function str2rstr_utf8(input) {
  var output = '';
  var i = -1;
  var x, y;

  while (++i < input.length) {
    /* Decode utf-16 surrogate pairs */
    x = input.charCodeAt(i);
    y = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
    if (0xd800 <= x && x <= 0xdbff && 0xdc00 <= y && y <= 0xdfff) {
      x = 0x10000 + ((x & 0x03ff) << 10) + (y & 0x03ff);
      i++;
    }

    /* Encode output as utf-8 */
    if (x <= 0x7f) output += String.fromCharCode(x);
    else if (x <= 0x7ff) output += String.fromCharCode(0xc0 | ((x >>> 6) & 0x1f), 0x80 | (x & 0x3f));
    else if (x <= 0xffff)
      output += String.fromCharCode(0xe0 | ((x >>> 12) & 0x0f), 0x80 | ((x >>> 6) & 0x3f), 0x80 | (x & 0x3f));
    else if (x <= 0x1fffff)
      output += String.fromCharCode(
        0xf0 | ((x >>> 18) & 0x07),
        0x80 | ((x >>> 12) & 0x3f),
        0x80 | ((x >>> 6) & 0x3f),
        0x80 | (x & 0x3f)
      );
  }
  return output;
}

/*
 * Encode a string as utf-16
 */
function str2rstr_utf16le(input) {
  var output = '';
  for (var i = 0; i < input.length; i++)
    output += String.fromCharCode(input.charCodeAt(i) & 0xff, (input.charCodeAt(i) >>> 8) & 0xff);
  return output;
}

function str2rstr_utf16be(input) {
  var output = '';
  for (var i = 0; i < input.length; i++)
    output += String.fromCharCode((input.charCodeAt(i) >>> 8) & 0xff, input.charCodeAt(i) & 0xff);
  return output;
}

/*
 * Convert a raw string to an array of little-endian words
 * Characters >255 have their high-byte silently ignored.
 */
function rstr2binl(input) {
  var output = Array(input.length >> 2);
  for (var i = 0; i < output.length; i++) output[i] = 0;
  for (var i = 0; i < input.length * 8; i += 8) output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << i % 32;
  return output;
}

/*
 * Convert an array of little-endian words to a string
 */
function binl2rstr(input) {
  var output = '';
  for (var i = 0; i < input.length * 32; i += 8) output += String.fromCharCode((input[i >> 5] >>> i % 32) & 0xff);
  return output;
}

/*
 * Calculate the MD5 of an array of little-endian words, and a bit length.
 */
function binl_md5(x, len) {
  /* append padding */
  x[len >> 5] |= 0x80 << len % 32;
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  var a = 1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d = 271733878;

  for (var i = 0; i < x.length; i += 16) {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;

    a = md5_ff(a, b, c, d, x[i + 0], 7, -680876936);
    d = md5_ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5_ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5_ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5_ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5_ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5_ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5_ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5_ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5_ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5_ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5_ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5_ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5_ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5_ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5_ff(b, c, d, a, x[i + 15], 22, 1236535329);

    a = md5_gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5_gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5_gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5_gg(b, c, d, a, x[i + 0], 20, -373897302);
    a = md5_gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5_gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5_gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5_gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5_gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5_gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5_gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5_gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5_gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5_gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5_gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5_gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = md5_hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5_hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5_hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5_hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5_hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5_hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5_hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5_hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5_hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5_hh(d, a, b, c, x[i + 0], 11, -358537222);
    c = md5_hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5_hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5_hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5_hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5_hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5_hh(b, c, d, a, x[i + 2], 23, -995338651);

    a = md5_ii(a, b, c, d, x[i + 0], 6, -198630844);
    d = md5_ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5_ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5_ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5_ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5_ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5_ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5_ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5_ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5_ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5_ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5_ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5_ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5_ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5_ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5_ii(b, c, d, a, x[i + 9], 21, -343485551);

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
  }
  return Array(a, b, c, d);
}

/*
 * These functions implement the four basic operations the algorithm uses.
 */
function md5_cmn(q, a, b, x, s, t) {
  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s), b);
}
function md5_ff(a, b, c, d, x, s, t) {
  return md5_cmn((b & c) | (~b & d), a, b, x, s, t);
}
function md5_gg(a, b, c, d, x, s, t) {
  return md5_cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function md5_hh(a, b, c, d, x, s, t) {
  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5_ii(a, b, c, d, x, s, t) {
  return md5_cmn(c ^ (b | ~d), a, b, x, s, t);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y) {
  var lsw = (x & 0xffff) + (y & 0xffff);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function bit_rol(num, cnt) {
  return (num << cnt) | (num >>> (32 - cnt));
}

$.fn.hasAttr = function(name) {
  return typeof this.attr(name) !== 'undefined';
};

String.prototype.format = function() {
  var pattern = /\{\d+\}/g;
  var a = arguments;
  return this.replace(pattern, function(capture) {
    return a[capture.match(/\d+/)];
  });
};

jQuery.fn.serializeObject = function() {
  var arrayData, objectData;
  arrayData = this.serializeArray();
  objectData = {};

  jQuery.each(arrayData, function() {
    var value;

    if (this.value != null) {
      value = this.value;
    } else {
      value = '';
    }

    if (objectData[this.name] != null) {
      if (!objectData[this.name].push) {
        objectData[this.name] = [objectData[this.name]];
      }

      objectData[this.name].push(value);
    } else {
      objectData[this.name] = value;
    }
  });

  return objectData;
};

(function($) {
  $.fn.toJSON = function(options) {
    options = $.extend({}, options);

    var self = this,
      json = {},
      push_counters = {},
      patterns = {
        validate: /^[a-zA-Z][a-zA-Z0-9_]*(?:\[(?:\d*|[a-zA-Z0-9_]+)\])*$/,
        key: /[a-zA-Z0-9_]+|(?=\[\])/g,
        push: /^$/,
        fixed: /^\d+$/,
        named: /^[a-zA-Z0-9_]+$/,
      };

    this.build = function(base, key, value) {
      base[key] = value;
      return base;
    };

    this.push_counter = function(key) {
      if (push_counters[key] === undefined) {
        push_counters[key] = 0;
      }
      return push_counters[key]++;
    };

    $.each($(this).serializeArray(), function() {
      // skip invalid keys
      if (!patterns.validate.test(this.name)) {
        return;
      }

      var k,
        keys = this.name.match(patterns.key),
        merge = this.value,
        reverse_key = this.name;

      while ((k = keys.pop()) !== undefined) {
        // adjust reverse_key
        reverse_key = reverse_key.replace(new RegExp('\\[' + k + '\\]$'), '');

        // push
        if (k.match(patterns.push)) {
          merge = self.build({}, self.push_counter(reverse_key), merge);
        }

        // fixed
        else if (k.match(patterns.fixed)) {
          merge = self.build({}, k, merge);
        }

        // named
        else if (k.match(patterns.named)) {
          merge = self.build({}, k, merge);
        }
      }

      json = $.extend(true, json, merge);
    });

    return json;
  };
})(jQuery);

jQuery.fn.serializeJSON = function() {
  var json = {};
  jQuery.map(jQuery(this).serializeArray(), function(n, i) {
    json[n['name']] = n['value'];
  });
  return json;
};

jQuery.fn.sortElements = (function() {
  var sort = [].sort;

  return function(comparator, getSortable) {
    getSortable =
      getSortable ||
      function() {
        return this;
      };

    var placements = this.map(function() {
      var sortElement = getSortable.call(this),
        parentNode = sortElement.parentNode,
        // Since the element itself will change position, we have
        // to have some way of storing its original position in
        // the DOM. The easiest way is to have a 'flag' node:
        nextSibling = parentNode.insertBefore(document.createTextNode(''), sortElement.nextSibling);

      return function() {
        if (parentNode === this) {
          throw new Error("You can't sort elements if any one is a descendant of another.");
        }

        // Insert before flag:
        parentNode.insertBefore(this, nextSibling);
        // Remove flag:
        parentNode.removeChild(nextSibling);
      };
    });

    return sort.call(this, comparator).each(function(i) {
      placements[i].call(getSortable.call(this));
    });
  };
})();

var windowWidths = {
  xsScreenMax: 543,
  sScreenMin: 544,
  sScreenMax: 767,
  mScreenMin: 768,
  mScreenMax: 991,
  lScreenMin: 992,
  lScreenMax: 1199,
  xlScreenMin: 1200,
  mLoginMax: 817,
};

// HANDLER FUNCTIONS DEFINITIONS

var handleAccordions = function() {
  var accordions = document.getElementsByClassName('accordion');

  if (!accordions) {
    return;
  }

  for (var accordionsIndex = 0; accordionsIndex < accordions.length; accordionsIndex++) {
    var categoryHeaders = accordions[accordionsIndex].querySelectorAll('.accordion-cat-title');

    for (var categoryHeadersIndex = 0; categoryHeadersIndex < categoryHeaders.length; categoryHeadersIndex++) {
      categoryHeaders[categoryHeadersIndex].onclick = toggleCategory;
    }
  }

  function toggleCategory() {
    this.classList.toggle('active');
    this.nextElementSibling.classList.toggle('show');
  }
};

/**
 * Created by mkasperski on 19.12.2016.
 */

var breakpoints = {
  mobile: 768,
  tablet: 1024,
};

var category = {
  init: function() {
    this.actions();
    this.priceSlider.initElement();
    this.countProducts();
    this.catalogHeaderHeight = jQuery('#catalogHeader').height();
    this.setProductsSectionPadding();
    this.lazyLoad();
  },

  /**
   * Toggles product photo and price after clicking color button.
   */
  toggleProductInfo: function() {
    var $productsSection = jQuery('#productsSection');

    $productsSection.find('.product .js-sample-selector').click(function() {
      var $this = jQuery(this),
        $productElement = $this.parents('.product'),
        $pricesWrapperElement = $productElement.find('.product-prices'),
        $priceElement = $pricesWrapperElement.find('.price:not(.old-price)'),
        $priceValueElement = $priceElement.find('.price-value'),
        $oldPriceElement = $pricesWrapperElement.find('.price.old-price'),
        $oldPriceValueElement = $oldPriceElement.find('.price-value'),
        url = $this.data('url'),
        img = $this.data('img'),
        backImg = $this.data('back-img'),
        hasPromo = $this.data('has-promo'),
        standardPrice = $this.data('standard-price'),
        promoPrice = $this.data('promo-price');

      $this.siblings().removeClass('selected');
      $this.addClass('selected');
      $productElement.children('a').attr('href', url);
      $productElement
        .find('img.product-image-detail')
        .attr('src', img)
        .data('image', img)
        .data('hover-image', backImg);

      $oldPriceValueElement.text(standardPrice);
      if (hasPromo) {
        $priceValueElement.text(promoPrice);
        $oldPriceElement.removeClass('hidden-price');
        $priceElement.addClass('new-price');
      } else {
        $priceValueElement.text(standardPrice);
        $oldPriceElement.addClass('hidden-price');
        $priceElement.removeClass('new-price');
      }
    });
  },
  actions: function() {
    var _this = this,
      $selectWrapperElements = jQuery('#allFiltersWrapper .select-wrapper'),
      $filtersIcon = jQuery('#filtersIcon'),
      $applyFiltersButton = jQuery('#applyFilters'),
      $closeFiltersButton = jQuery('#closeFilters'),
      headerHeight = jQuery('#header').height(),
      $window = jQuery(window),
      isMobile = false;

    _this.toggleProductInfo();

    $selectWrapperElements.click(function() {
      $(this).toggleClass('selected');
    });

    jQuery('body')
      .not('.select-wrapper')
      .click(function() {
        $selectWrapperElements.removeClass('selected');
      });

    $applyFiltersButton.click(toggleFilters);
    $closeFiltersButton.click(toggleFilters);

    $filtersIcon.click(toggleFilters);

    function toggleFilters() {
      jQuery('#allFiltersWrapper').toggleClass('fixed');
      _this.checkCatalogHeaderHeight();
      $filtersIcon.toggleClass('selected');
    }

    function closeFilters(event) {
      var $target = jQuery(event.target);
      if ($target.attr('id') === 'filtersIcon' || $target.parents('#allFiltersWrapper').length) {
        return;
      }

      jQuery('#allFiltersWrapper').removeClass('fixed');
      _this.checkCatalogHeaderHeight();
      $filtersIcon.removeClass('selected');
    }

    $window.resize(function() {
      _this.catalogHeaderHeight = jQuery('#catalogHeader').height();
      _this.setProductsSectionPadding();
      var $body = jQuery(document.body);

      if (this.outerWidth < breakpoints.tablet) {
        if (!isMobile) {
          $body.on('click', closeFilters);
        }
        isMobile = true;
      } else {
        if (isMobile) {
          $body.off('click', closeFilters);
        }
        isMobile = false;
      }
    });

    $window.scroll(function() {
      if (window.outerWidth > breakpoints.mobile) {
        if (window.scrollY > headerHeight) {
          $filtersIcon.addClass('show');
        } else {
          $filtersIcon.removeClass('show');
        }
      }
    });

    jQuery('.products-grid')
      .on('mouseenter', '.product-image', function() {
        if (window.innerWidth >= breakpoints.tablet) {
          var $this = jQuery(this),
            $productItem = $this.find('.product-image-detail');

          $productItem.addClass('active').attr('src', $productItem.data('hover-image'));
        }
      })
      .on('mouseleave', '.product-image', function() {
        if (window.innerWidth >= breakpoints.tablet) {
          var $this = jQuery(this),
            $productItem = $this.find('.product-image-detail');

          $productItem.removeClass('active').attr('src', $productItem.data('image'));
        }
      });
  },

  catalogHeaderHeight: 0,
  checkCatalogHeaderHeight: function() {
    var $allFiltersWrapper = jQuery('#allFiltersWrapper');
    if (this.isCatalogHeaderNarrow()) {
      $allFiltersWrapper.addClass('double-row');
    } else {
      $allFiltersWrapper.removeClass('double-row');
    }
  },
  isCatalogHeaderNarrow: function() {
    return this.catalogHeaderHeight > 40;
  },
  setProductsSectionPadding: function() {
    if (window.outerWidth <= breakpoints.mobile) {
      jQuery('#productsSection').css('padding-top', this.catalogHeaderHeight);
    }
  },
  priceSlider: {
    initElement: function() {
      this.$sliderElement = $('#nstSlider');
      this.priceMin = this.$sliderElement.data('range_min');
      this.priceMax = this.$sliderElement.data('range_max');
      this.init();
    },
    init: function() {
      var _this = this;
      this.$sliderElement.nstSlider({
        left_grip_selector: '.left-grip',
        right_grip_selector: '.right-grip',
        value_bar_selector: '.bar',
        value_changed_callback: function(cause, leftValue, rightValue, prevLeft, prevRight) {
          var $this = $(this),
            $thisParent = $this.parent();
          $thisParent.find('.left-label').text(leftValue);
          $thisParent.find('.right-label').text(rightValue);
          if (cause !== 'init' && (leftValue !== prevLeft || rightValue !== prevRight)) {
            categoryFilters.hasFilters(true);
          }
          categoryFilters.filterProducts.init('price', leftValue, rightValue);
          _this.isActive = !_this.hasDefaultValues(leftValue, rightValue);
        },
      });
    },
    $sliderElement: null,
    priceMin: 0,
    priceMax: 0,
    isActive: false,
    hasDefaultValues: function(min, max) {
      return this.priceMin === min && this.priceMax === max;
    },
    resetSlider: function() {
      this.$sliderElement.nstSlider('teardown');
      this.init();
    },
  },
  countProducts: function() {
    var allItems = document.querySelectorAll('.products-grid .product').length,
      productCountElement = document.querySelector('.products-toolbar .products-count > span');

    if (productCountElement) {
      productCountElement.innerText = allItems;
    }
  },
  lazyLoad: function() {
    this.bLazy = new Blazy();
  },
};
var categoryFilters = {
  init: function() {
    this.$filtersScope = jQuery('#allFiltersWrapper');
    this.$filtersClear = jQuery('#resetFilters');
    this.hasFilters();
    this.actions();
  },
  $filtersScope: null,
  hasFilters: function(state) {
    if (state) {
      this.$filtersClear.show();
    } else {
      this.$filtersClear.hide();
    }
  },
  actions: function() {
    var _this = this;

    jQuery('.js-sorting', _this.$filtersScope).click(function($event) {
      $event.stopPropagation();
      var type = this.dataset.type;
      if (this.querySelector('input').checked) {
        _this.sortProducts.init(type);
        _this.hasFilters(true);
      }
    });

    jQuery('.js-filter-label', _this.$filtersScope).change(function() {
      var filter = this.dataset.filter;
      if (jQuery('.js-filter-label:checked', _this.$filtersScope).length || category.priceSlider.isActive) {
        _this.hasFilters(true);
      } else {
        _this.hasFilters(false);
      }
      _this.filterProducts.init(filter);
    });

    _this.$filtersClear.click(function() {
      jQuery('#sortingNewest').trigger('click');
      _this.filterProducts.clearFilters();
      _this.hasFilters(false);
    });
  },
  sortProducts: {
    init: function(type) {
      this.$categoryWrapper = jQuery('#productsSection');
      this.$allItems = this.$categoryWrapper.find('.product');
      switch (type) {
        case 'default':
          this.byDefault();
          break;
        case 'newest':
          this.byNewests();
          break;
        case 'priceUp':
          this.byPriceUp();
          break;
        case 'priceDown':
          this.byPriceDown();
          break;
        default:
          break;
      }

      if (category.bLazy) {
        category.bLazy.revalidate();
      }
    },
    $categoryWrapper: null,
    $allItems: null,
    byDefault: function() {
      var $result = this.$allItems.sort(function(a, b) {
        var defaultOrderA = parseInt(a.dataset.defaultOrder) || 9999,
          defaultOrderB = parseInt(b.dataset.defaultOrder) || 9999;
        if (defaultOrderA > defaultOrderB) {
          return 1;
        } else if (defaultOrderA < defaultOrderB) {
          return -1;
        } else {
          return 0;
        }
      });
      this.$categoryWrapper.html($result);
      category.toggleProductInfo();
    },
    byPriceUp: function() {
      var $result = this.$allItems.sort(function(a, b) {
        var priceA = parseInt(a.dataset.price),
          priceB = parseInt(b.dataset.price);
        if (priceA > priceB) {
          return 1;
        } else if (priceA < priceB) {
          return -1;
        } else {
          return 0;
        }
      });
      this.$categoryWrapper.html($result);
      category.toggleProductInfo();
    },
    byPriceDown: function() {
      var $result = this.$allItems.sort(function(a, b) {
        var priceA = parseInt(a.dataset.price),
          priceB = parseInt(b.dataset.price);
        if (priceA < priceB) {
          return 1;
        } else if (priceA > priceB) {
          return -1;
        } else {
          return 0;
        }
      });
      this.$categoryWrapper.html($result);
      category.toggleProductInfo();
    },
    byNewests: function() {
      var $result = this.$allItems.sort(function(a, b) {
        var dateCreatedA = a.dataset.releaseDate,
          dateCreatedB = b.dataset.releaseDate,
          sortDates = function(dateA, dateB) {
            if (dateA < dateB) {
              return 1;
            } else if (dateA > dateB) {
              return -1;
            } else {
              return 0;
            }
          };
        return sortDates(dateCreatedA, dateCreatedB);
      });
      this.$categoryWrapper.html($result);
      category.toggleProductInfo();
    },
  },
  filterProducts: {
    init: function(filter, minPrice, maxPrice) {
      this.findAllProducts();
      this.refreshProductsCount();
      switch (filter) {
        case 'color':
          this.byColor();
          break;
        case 'size':
          this.bySize();
          break;
        case 'characteristic':
          this.byCharacteristic();
          break;
        case 'price':
          this.byPrice(minPrice, maxPrice);
          break;
        default:
          break;
      }
    },
    $allItems: null,
    visibleColors: [],
    visibleSizes: [],
    visibleCharacteristics: [],
    visiblePrices: {
      min: 0,
      max: 0,
    },
    lang: window.location.pathname.substring(1, 6),
    findAllProducts: function() {
      this.$allItems = jQuery('#productsSection').find('.product');
    },
    refreshProductsCount: function() {
      var filteredCount = jQuery('#productsSection').find('.product:not(.hidden)').length;
      jQuery('.products-toolbar .products-count > span').text(filteredCount);
    },
    byColor: function() {
      var _this = this,
        $colorsChecked = jQuery('#filterColors').find('.list-wrapper input:checked');
      _this.visibleColors = [];
      $colorsChecked.each(function() {
        _this.visibleColors.push(this.dataset.value);
      });
      _this.doFilter();
    },
    bySize: function() {
      var _this = this,
        $sizesChecked = jQuery('#filterSizes').find('.list-wrapper input:checked');
      _this.visibleSizes = [];
      $sizesChecked.each(function() {
        _this.visibleSizes.push(this.dataset.value);
      });
      _this.doFilter();
    },
    byCharacteristic: function() {
      var _this = this,
        $characteristicsChecked = jQuery('#filterStyle').find('.list-wrapper input:checked');
      _this.visibleCharacteristics = [];
      $characteristicsChecked.each(function() {
        _this.visibleCharacteristics.push(this.dataset.value);
      });
      _this.doFilter();
    },
    byPrice: function(minPrice, maxPrice) {
      this.visiblePrices.min = minPrice;
      this.visiblePrices.max = maxPrice;
      this.doFilter();
    },
    doFilter: function() {
      var _this = this;
      _this.findAllProducts();
      _this.$allItems.each(function() {
        var $this = jQuery(this),
          productColor = this.dataset.color,
          productSizes = this.dataset.sizes.split(','),
          productCharacteristics = this.dataset.characteristics.split(','),
          productPrice = LPP.price.format(this.dataset.price, true),
          colorsFound = 0,
          sizesFound = 0,
          characteristicsFound = 0;

        _this.visibleColors.forEach(function(element) {
          if (productColor === element) {
            colorsFound++;
          }
        });
        productSizes.forEach(function(element) {
          if (_this.visibleSizes.indexOf(element) !== -1) {
            sizesFound++;
          }
        });
        _this.visibleCharacteristics.forEach(function(element) {
          if (productCharacteristics.indexOf(element) !== -1) {
            characteristicsFound++;
          }
        });
        if (
          (_this.visibleSizes.length === sizesFound || (_this.visibleSizes.length > sizesFound && sizesFound > 0)) &&
          (_this.visibleColors.length === colorsFound ||
            (_this.visibleColors.length > colorsFound && colorsFound > 0)) &&
          _this.visibleCharacteristics.length === characteristicsFound &&
          ((_this.visiblePrices.min <= productPrice && _this.visiblePrices.max >= productPrice) ||
            (_this.lang === 'si/en' && isNaN(productPrice)))
        ) {
          $this.removeClass('hidden');
        } else {
          $this.addClass('hidden');
        }
      });
      _this.refreshProductsCount();

      if (category.bLazy) {
        category.bLazy.revalidate();
      }
    },
    clearFilters: function() {
      this.findAllProducts();
      this.visibleColors = [];
      this.visibleSizes = [];
      this.visibleCharacteristics = [];
      this.visiblePrices.min = category.priceSlider.priceMin;
      this.visiblePrices.max = category.priceSlider.priceMax;
      this.$allItems.removeClass('hidden');
      categoryFilters.$filtersScope
        .find('.js-filter-label')
        .removeAttr('checked')
        .removeClass('checked');
      category.priceSlider.resetSlider();
      categoryFilters.sortProducts.init('default');
      this.refreshProductsCount();
    },
  },
};
jQuery(document).ready(function() {
  var $bodyId = $('body').attr('id');
  if ($bodyId === 'category' || $bodyId === 'search') {
    category.init();
    categoryFilters.init();
  }
});

LPP.sinsay.checkout = LPP.sinsay.checkout || {};
LPP.sinsay.checkout.validation = LPP.sinsay.checkout.validation || {};

LPP.sinsay.checkout.validation.shipping = (function() {
  var self = function($shippingForm) {
    $shippingForm.validate({
      rules: {
        delivery_type: rules.delivery_type,
      },
      messages: {
        delivery_type: messages.delivery_type,
      },
      submitHandler: self.submitEventHandler,
    });
  };

  self.submitEventHandler = function(form) {
    var checkoutStepAddress = document.getElementById('checkout-step-address'),
      checkoutStepAddressPickup = document.getElementById('checkout-step-address-pickup'),
      onlyPickups = document.getElementsByClassName('only-pickup').toArray(),
      checkoutStepAddressShippingData = document.getElementById('checkout-step-address-shipping-data');

    if (self.isPickupPointChecked(form) || self.isStoreMethodChecked(form)) {
      showElement(checkoutStepAddressPickup);
      onlyPickups.forEach(showElement);
      hideElement(checkoutStepAddressShippingData);

      checkoutStepAddress.classList.add('pickup');
    } else {
      hideElement(checkoutStepAddressPickup);
      onlyPickups.forEach(hideElement);
      showElement(checkoutStepAddressShippingData);

      checkoutStepAddress.classList.remove('pickup');
      changeAddress();
    }

    // Set method name btn
    self.updateSummaryView();

    openNextStep();
    LPP.sinsay.checkout.validation.address.checkValidation();
  };

  self.isPickupPointChecked = function(container) {
    return self.isChecked(container, 'input[value$="_pp"]');
  };

  self.isStoreMethodChecked = function(container) {
    return self.isChecked(container, 'input[value="storemethod"]');
  };

  self.isChecked = function(container, selector) {
    var isChecked = false;

    container
      .querySelectorAll(selector)
      .toArray()
      .forEach(function(element) {
        if (element.checked) {
          isChecked = true;
        }
      });

    return isChecked;
  };

  self.updateSummaryView = function() {
    var checked = document
        .getElementById('checkout-step-methods')
        .querySelectorAll('input')
        .toArray()
        .filter(function(input) {
          return input.checked;
        })[0],
      parentLi = getParentByTagName(checked, 'li'),
      deliveryName = jQuery(parentLi.getElementsByClassName('shipping-name')[0]).data('name'),
      subtotal = jQuery(document.getElementsByClassName('subtotal-price')[0]).data('subtotal');

    document.getElementsByClassName('grand-total-price')[0].textContent = LPP.price.format(subtotal);
    document.getElementsByClassName('shipping-method-name')[0].textContent = deliveryName;
  };

  function hideElement(element) {
    element.style.display = 'none';
  }

  function showElement(element) {
    element.style.display = null;
  }

  function getParentByTagName(element, parentTagName) {
    if (element.parentNode.tagName === 'BODY') {
      return null;
    }

    if (element.parentNode.tagName === parentTagName.toUpperCase()) {
      return element.parentNode;
    }

    return getParentByTagName(element.parentNode, parentTagName);
  }

  return self;
})();

LPP.sinsay.checkout = LPP.sinsay.checkout || {};
LPP.sinsay.checkout.validation = LPP.sinsay.checkout.validation || {};

LPP.sinsay.checkout.validation.address = (function() {
  var self = function($addressForm, rules, messages) {
    var isGeoValidationEnabled = LegacyBridge.getStoreConfig('geoValidation/enabled');
    if (rules.postcode.rxpattern) {
      rules.postcode.pattern = rules.postcode.rxpattern;
      delete rules.postcode.rxpattern;
    }

    var warningClass = 'warning',
      isCompanyInvoice = jQuery('#checkout-step-address-billing-invoice-1').is(':checked');

    if (!self.checkoutGeoValidation) {
      self.checkoutGeoValidation = new LPP.common.GeoValidation(
        rules,
        isCompanyInvoice,
        [
          {
            field: 'shipping[invoice][postcode]',
            validator: 'postcode',
          },
          {
            field: 'shipping[invoice][city]',
            validator: 'city',
          },
          {
            field: 'shipping[invoice][street1]',
            validator: 'street',
          },
          {
            field: 'shipping[invoice][street2]',
            validator: 'street_nb',
          },
          {
            field: 'shipping[invoice][firstname]',
            validator: 'firstname',
          },
          {
            field: 'shipping[invoice][lastname]',
            validator: 'lastname',
          },
        ],
        {
          phoneEl: document.querySelectorAll('#phonePickup')[0],
          dialCodeEl: document.querySelectorAll('[name="dial_code"]')[0],
          phoneElName: self.phoneElName ? self.phoneElName : '[name="shipping[phone]"]',
        },
        '#checkout-step-address-invoice-data',
        [
          'shipping[invoice][company]',
          'shipping[invoice][nip]',
          'shipping[invoice][vatdph]',
          'shipping[invoice][regon]',
        ]
      );
    }

    if (isGeoValidationEnabled) {
      self.courierTooltip = new LPP.common.tooltip(
        'geoValidationCourierTooltip',
        LegacyBridge.getStoreConfig('geoValidation/tooltipCourierText')
      );
      self.storeTooltip = new LPP.common.tooltip(
        'geoValidationTooltip',
        LegacyBridge.getStoreConfig('geoValidation/tooltipText')
      );
    }

    if (self.checkoutValidator) {
      self.checkoutValidator.destroy();
    }

    self.checkoutValidator = $addressForm.validate({
      showErrors: function() {
        self.checkoutGeoValidation.tryDisplayError(self.checkoutValidator.invalid);

        this.defaultShowErrors();
      },
      errorPlacement: function(error, element) {
        element.parent().append(error);
      },
      // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
      highlight: function(element, errorClass, validClass) {
        if (jQuery(element).hasClass('phone-number-prefix')) {
          return;
        }
        $(element)
          .parent('div')
          .addClass(errorClass)
          .removeClass(validClass);
        element.parentElement.classList.remove(warningClass);

        self.checkoutGeoValidation.tryDisplayError(self.checkoutValidator.invalid);
      },
      unhighlight: function(element, errorClass, validClass) {
        if (jQuery(element).hasClass('phone-number-prefix')) {
          return;
        }
        $(element)
          .parent('div')
          .addClass(validClass)
          .removeClass(errorClass);
        element.parentElement.classList.remove(warningClass);

        self.checkoutGeoValidation.tryDisplayError(self.checkoutValidator.invalid);
      },
      onfocusout: function(element) {
        this.element(element);
      },
      submitHandler: self.submitEventHandler,
      rules: jQuery.extend(
        {
          'shipping[firstname]': rules.firstname,
          'shipping[lastname]': rules.lastname,
          'shipping[company]': rules.company,
          'shipping[street1]': rules.street,
          'shipping[street2]': rules.street_nb,
          'shipping[city]': rules.city,
          'shipping[postcode]': rules.postcode,
          'shipping[phone]': rules.phone,
          pickpoint: rules.store,
          'shipping[additional-information]': rules.additional_information,
          'shipping[invoice][company]': rules.company,
          'shipping[invoice][nip]': rules.vatin,
          'shipping[invoice][regon]': rules.regon,
          'shipping[invoice][vatin]': rules.vatin,
          'shipping[invoice][vatdph]': rules.vatdph,
          'shipping[invoice][pesel]': rules.pesel,
          'shipping[email]': rules.email,
          'shipping[register][dob]': rules.dob,
          'shipping[register][gender]': rules.gender,
          'shipping[register][password]': rules.password,
          'shipping[register][confirmation]': {
            required: true,
            equalTo: 'input[name="shipping[register][password]"]',
          },
          conditions: rules.regulations,
        },
        self.checkoutGeoValidation.getRules()
      ),
      messages: {
        'shipping[firstname]': messages.firstname,
        'shipping[lastname]': messages.lastname,
        'shipping[company]': messages.company,
        'shipping[street1]': messages.street,
        'shipping[street2]': messages.street_nb,
        'shipping[city]': messages.city,
        'shipping[postcode]': messages.postcode,
        'shipping[phone]': messages.phone,
        pickpoint: messages.store,
        'shipping[additional-information]': messages.additional_information,
        'shipping[invoice][company]': messages.company,
        'shipping[invoice][nip]': messages.vatin,
        'shipping[invoice][regon]': messages.regon,
        'shipping[invoice][vatin]': messages.vatin,
        'shipping[invoice][vatdph]': messages.vatdph,
        'shipping[invoice][firstname]': messages.firstname,
        'shipping[invoice][lastname]': messages.lastname,
        'shipping[invoice][pesel]': messages.pesel,
        'shipping[invoice][street1]': messages.street,
        'shipping[invoice][street2]': messages.street_nb,
        'shipping[invoice][city]': messages.city,
        'shipping[invoice][postcode]': messages.postcode,
        'shipping[email]': messages.email,
        'shipping[register][dob]': messages.dob,
        'shipping[register][gender]': messages.gender,
        'shipping[register][password]': messages.password,
        'shipping[register][confirmation]': messages.confirmation,
        conditions: messages.regulations,
      },
    });

    self.checkValidation();
  };

  self.checkPhoneValidation = function(forcePhone) {
    if (forcePhone) {
      self.phoneElName = '#phone';
      self.checkoutGeoValidation.phoneConfig.phoneElName = self.phoneElName;
      self.checkoutGeoValidation.preventChangeRule = true;
      self.checkoutGeoValidation.changeRuleTo(self.checkoutValidator, true);
    } else {
      self.phoneElName = '#phonePickup';
      self.checkoutGeoValidation.phoneConfig.phoneElName = self.phoneElName;
      self.checkoutGeoValidation.preventChangeRule = false;
      self.checkoutGeoValidation.changeRuleTo(self.checkoutValidator, false);
    }
  };

  self.checkValidation = function() {
    self.checkoutGeoValidation.checkValidation(self.checkoutValidator);
  };

  self.closeWarning = function() {
    if (self.checkoutGeoValidation) {
      self.checkoutGeoValidation.closeError();
    }
  };

  self.submitEventHandler = function(form) {
    var postcode = form
        .querySelectorAll('#checkout-step-address-shipping-data .address [name="shipping[postcode]"]')
        .toArray()
        .reduce(function(previousValue, currentValue) {
          return previousValue.value ? previousValue : currentValue;
        }).value,
      deliveryType = document.querySelector('.delivery-method.checked').dataset.shippingMethod;

    if (deliveryType + 'cod' === LPP.common.shipping.dummyCourierMethodCod) {
      LPP.common.checkout.isPostCodeOutOfService(postcode).then(function(response) {
        if (response === false) {
          self.goToNextStep(form);
          return;
        }

        popupOpen('flash', { message: global.i18n.no_courier_for_your_postcode });
      });
    } else {
      LPP.common.checkout
        .isPostcodeInService(postcode, deliveryType)
        .then(function goToNextStepIfInService(isPostcodeInService) {
          if (isPostcodeInService) {
            self.goToNextStep(form);
          } else {
            popupOpen('confirm', {
              message: global.i18n.no_postcode_in_database,
              confirmAction: function() {
                self.goToNextStep(form);
              },
            });
          }
        });
    }
  };

  self.goToNextStep = function(form) {
    var invoice = document.getElementById('checkout-step-address-billing-invoice'),
      isInvoiceACheckbox = invoice && invoice.type === 'checkbox',
      wantInvoice = !isInvoiceACheckbox || invoice.checked,
      saveAdressEl = document.getElementById('checkout-step-address-shipping-add'),
      registerGenderSelectNode,
      billing = '',
      shipping;

    if (saveAdressEl) {
      saveAdressEl.value = saveAdressEl.checked ? '1' : '';
    }

    // Prepare addresses
    shipping = buildAddress(jQuery('#checkout-step-address-shipping-data').find('.address:visible'));

    if (wantInvoice) {
      billing = buildAddress(
        jQuery('#checkout-step-address-billing-invoice-wrapper, #checkout-step-address-invoice-data')
      );
    }

    document
      .getElementsByClassName('address delivery-address')
      .toArray()
      .forEach(function(node) {
        node.innerHTML = shipping;
      });

    registerGenderSelectNode = form.querySelector('select[name="shipping[register][gender]"]');

    if (registerGenderSelectNode) {
      form.querySelector('input[name="shipping[gender]"]').value = registerGenderSelectNode.value || '';
    }

    self.checkoutGeoValidation.closeError();
    openNextStep();
  };

  return self;
})();

LPP.sinsay.checkout = LPP.sinsay.checkout || {};
LPP.sinsay.checkout.validation = LPP.sinsay.checkout.validation || {};

LPP.sinsay.checkout.validation.summary = (function() {
  var self = function($summaryForm) {
    $summaryForm.validate({
      rules: {
        payment_method: 'required',
      },
      messages: {
        payment_method: global.i18n.payment_method,
      },
      submitHandler: self.submitEventHandler,
    });
  };

  self.submitEventHandler = function() {
    prepareAndSendData();
  };

  return self;
})();

/**
 * Created by mkasperski on 21.07.2016.
 */

var globalRules = getValidationRules(),
  isVatinRequired = globalRules.customer_address_vatin.min_text_length !== 0,
  isRegonRequired = globalRules.customer_address_regon.min_text_length !== 0;

var rules = {
  password: {
    required: true,
    minlength: globalRules.customer_password_hash.min_text_length,
  },
  password_optional: {
    required: false,
    minlength: globalRules.customer_password_hash.min_text_length,
  },
  firstname: {
    required: true,
    pattern: globalRules.customer_firstname.pattern_validation,
    minlength: globalRules.customer_firstname.min_text_length,
    maxlength: globalRules.customer_firstname.max_text_length,
  },
  lastname: {
    required: true,
    pattern: globalRules.customer_lastname.pattern_validation,
    minlength: globalRules.customer_lastname.min_text_length,
    maxlength: globalRules.customer_lastname.max_text_length,
  },
  email: {
    required: globalRules.customer_email.is_required,
    pattern: globalRules.customer_email.pattern_validation,
  },
  getEmailConfirmation: function () {
    return {
      required: this.email.required,
      pattern: this.email.pattern,
      equalTo: '#registerEmail',
    };
  },
  multiemail: {
    multiemail: globalRules.customer_multiemail.multiemail,
    required: globalRules.customer_multiemail.is_required,
  },
  email_exist: {
    email_exist: globalRules.customer_email_exist.email_exist,
    pattern: globalRules.customer_email.pattern_validation,
    required: globalRules.customer_email_exist.is_required,
  },
  username: {
    pattern: globalRules.customer_username.pattern_validation,
    required: globalRules.customer_username.is_required,
  },
  dialcode: {
    required: globalRules.customer_address_dial_code.is_required,
    pattern: globalRules.customer_address_dial_code.pattern_validation,
    maxlength: globalRules.customer_address_dial_code.max_text_length,
  },
  dialcode_optional: {
    required: globalRules.customer_dialcode_optional.is_required,
    pattern: globalRules.customer_dialcode_optional.pattern_validation,
    maxlength: globalRules.customer_dialcode_optional.max_text_length,
  },
  phone: {
    required: globalRules.customer_address_telephone.is_required,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.max_text_length,
  },
  phone_exact: {
    required: globalRules.customer_phone_number.is_required,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.max_text_length,
  },
  phone_optional: {
    required: false,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.min_text_length,
  },
  phone_optional_exact: {
    required: false,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.max_text_length,
  },
  street: {
    required: globalRules.customer_address_street_name.is_required,
    pattern: globalRules.customer_address_street_name.pattern_validation,
    maxlength: globalRules.customer_address_street_name.max_text_length,
  },
  street_nb: {
    required: globalRules.customer_address_street_number.is_required,
    pattern: globalRules.customer_address_street_number.pattern_validation,
    maxlength: globalRules.customer_address_street_number.max_text_length,
  },
  city: {
    required: globalRules.customer_address_city.is_required,
    pattern: globalRules.customer_address_city.pattern_validation,
    maxlength: globalRules.customer_address_city.max_text_length,
  },
  company: {
    required: true,
    pattern: globalRules.customer_address_company.pattern_validation,
    minlength: globalRules.customer_address_company.min_text_length,
    maxlength: globalRules.customer_address_company.max_text_length,
  },
  postcode: {
    required: globalRules.customer_address_postcode.is_required,
  },
  pesel: {
    required: globalRules.customer_address_pesel.is_required,
    digits: true,
    minlength: globalRules.customer_address_pesel.min_text_length,
    maxlength: globalRules.customer_address_pesel.max_text_length,
  },
  vatin: {
    get vatin_validation() {
      return LegacyBridge.getStoreConfig('languageCode') === 'pl_PL';
    },
    required: isVatinRequired,
    pattern: globalRules.customer_address_vatin.pattern_validation,
  },
  regon: {
    required: isRegonRequired,
    pattern: globalRules.customer_address_regon.pattern_validation,
  },
  vatdph: {
    required: globalRules.customer_address_vatdph.is_required,
    pattern: globalRules.customer_address_vatdph.pattern_validation,
  },
  store: {
    required: globalRules.store.is_required,
  },
  text_optional: {
    required: globalRules.text_optional.is_required,
    pattern: globalRules.text_optional.pattern_validation,
  },
  dob: {
    required: globalRules.customer_dob.is_required,
    isAdult: [true],
  },
  gender: {
    required: globalRules.customer_gender.is_required,
  },
  regulations: {
    required: true,
  },
  general_terms_statement: {
    required: true,
  },
  additional_information: {
    required: globalRules.customer_address_additional_information.is_required,
    pattern: globalRules.customer_address_additional_information.pattern_validation,
    minlength: globalRules.customer_address_additional_information.min_text_length,
    maxlength: globalRules.customer_address_additional_information.max_text_length,
  },
  contact_form_select: {
    required: globalRules.customer_contact_form_select.is_required,
  },
  g_recaptcha_response: {
    required: true,
  },
  rma_bank: {
    bankAccountNumberValidation: true,
    required: true,
  },
  rma_bank_owner: {
    required: true,
    pattern: globalRules.customer_firstname.pattern_validation,
  },
  rma_bank_ru_account: {
    bankAccountNumberValidation: true,
    required: true,
  },
  rma_bank_bik: {
    bankAccountNumberValidation: true,
    required: true,
  },
  rma_courier: {
    required: globalRules.rma_courier_pickup_date.is_required,
  },
  rma_select: {
    required: true,
  },
  number: {
    required: true,
    number: true,
  },
  delivery_type: {
    required: true,
  },
};

function normalizer(value) {
  return value ? value.trim() : '';
}

Object.keys(rules).forEach(function (prop) {
  if (rules[prop].required) {
    rules[prop].normalizer = normalizer;
  }
});

var messages = {
  password: {
    required: globalRules.customer_password_hash.validation_key_required,
    minlength: globalRules.customer_password_hash.validation_key_min,
  },
  password_optional: {
    minlength: globalRules.customer_password_hash.validation_key_min,
  },
  firstname: {
    required: globalRules.customer_firstname.validation_key_required,
    minlength: globalRules.customer_firstname.validation_key_min,
    maxlength: globalRules.customer_firstname.validation_key_max,
    pattern: globalRules.customer_firstname.validation_key_illegal,
  },
  lastname: {
    required: globalRules.customer_firstname.validation_key_required,
    minlength: globalRules.customer_firstname.validation_key_min,
    maxlength: globalRules.customer_firstname.validation_key_max,
    pattern: globalRules.customer_firstname.validation_key_illegal,
  },
  email: {
    required: globalRules.customer_email.validation_key_required,
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  emailConfirmation: {
    equalTo: global.i18n.different_emails,
    required: globalRules.customer_email.validation_key_required,
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  multiemail: {
    multiemail: globalRules.customer_multiemail.multiemail,
    required: globalRules.customer_multiemail.validation_key_illegal,
  },
  email_exist: {
    email_exist: globalRules.customer_email_exist.validation_key_illegal,
    pattern: globalRules.customer_email_exist.validation_key_illegal,
    required: globalRules.customer_email_exist.validation_key_required,
  },
  new_email: {
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  username: {
    required: globalRules.customer_email.validation_key_required,
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  dialcode: {
    required: globalRules.customer_address_dial_code.validation_key_required,
    maxlength: globalRules.customer_address_dial_code.validation_key_max,
    pattern: globalRules.customer_address_dial_code.validation_key_illegal,
  },
  dialcode_optional: {
    required: globalRules.customer_address_dial_code.validation_key_required,
    pattern: globalRules.customer_address_dial_code.pattern_validation,
    maxlength: globalRules.customer_address_dial_code.max_text_length,
  },
  phone: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: globalRules.customer_phone_number.validation_key_min,
    maxlength: globalRules.customer_phone_number.validation_key_max,
  },
  phone_exact: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: global.i18n['validation_length'],
    maxlength: global.i18n['validation_length'],
  },
  phone_optional: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: globalRules.customer_phone_number.validation_key_min,
    maxlength: globalRules.customer_phone_number.validation_key_max,
  },
  phone_optional_exact: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: global.i18n['validation_length'],
    maxlength: global.i18n['validation_length'],
  },
  street: {
    required: globalRules.customer_address_street_name.validation_key_required,
    maxlength: globalRules.customer_address_street_name.validation_key_max,
    pattern: globalRules.customer_address_street_name.validation_key_illegal,
  },
  street_nb: {
    required: globalRules.customer_address_street_number.validation_key_required,
    maxlength: globalRules.customer_address_street_number.validation_key_max,
    pattern: globalRules.customer_address_street_number.validation_key_illegal,
  },
  city: {
    required: globalRules.customer_address_city.validation_key_required,
    maxlength: globalRules.customer_address_city.validation_key_max,
    pattern: globalRules.customer_address_city.validation_key_illegal,
  },
  company: {
    required: globalRules.customer_address_company.validation_key_required,
    minlength: globalRules.customer_address_company.validation_key_min,
    maxlength: globalRules.customer_address_company.validation_key_max,
    pattern: globalRules.customer_address_company.validation_key_illegal,
  },
  postcode: {
    required: globalRules.customer_address_postcode.validation_key_required,
    maxlength: globalRules.customer_address_postcode.validation_key_max,
    pattern: globalRules.customer_address_postcode.validation_key_illegal,
  },
  pesel: {
    required: globalRules.customer_address_pesel.validation_key_required,
    minlength: globalRules.customer_address_pesel.validation_key_min,
    maxlength: globalRules.customer_address_pesel.validation_key_max,
    digits: globalRules.customer_address_pesel.validation_key_illegal,
  },
  vatin: {
    vatin_validation: global.i18n['validation_vatin_invalid'],
    required: globalRules.customer_address_vatin.validation_key_required,
    pattern: globalRules.customer_address_vatin.validation_key_illegal,
  },
  regon: {
    required: globalRules.customer_address_regon.validation_key_required,
    pattern: globalRules.customer_address_regon.validation_key_illegal,
  },
  vatdph: {
    required: globalRules.customer_address_vatdph.validation_key_required,
    pattern: globalRules.customer_address_vatdph.validation_key_illegal,
  },
  store: {
    required: global.i18n['pickpoint'],
  },
  text_optional: {
    required: globalRules.text_optional.is_required,
    pattern: globalRules.text_optional.pattern_validation,
  },
  gender: {
    required: globalRules.customer_gender.validation_key_required,
  },
  dob: {
    required: globalRules.customer_dob.validation_key_required,
  },
  confirmation: {
    required: globalRules.customer_password_hash_confirmation.validation_key_required,
    equalTo: global.i18n['validation_equals_to'],
  },
  regulations: {
    required: global.i18n['regulations_required'],
  },
  general_terms_statement: {
    required: global.i18n['validation_required'],
  },
  additional_information: {
    required: globalRules.customer_address_additional_information.validation_key_required,
    pattern: globalRules.customer_address_additional_information.validation_key_illegal,
    minlength: globalRules.customer_address_additional_information.validation_key_min,
    maxlength: globalRules.customer_address_additional_information.validation_key_max,
  },
  contact_form_select: {
    required: globalRules.customer_contact_form_select.validation_key_required,
  },
  g_recaptcha_response: {
    required: global.i18n['validation_required'],
  },
  rma_bank: {
    bankAccountNumberValidation: global.i18n['validation_bank_invalid'],
    required: global.i18n['validation_required'],
  },
  rma_bank_owner: {
    required: global.i18n['this_field_is_required'],
    pattern: global.i18n['validation_illegal'],
  },
  rma_bank_ru_account: {
    bankAccountNumberValidation: global.i18n['validation_bank_account_invalid'],
    required: global.i18n['validation_required'],
  },
  rma_bank_bik: {
    bankAccountNumberValidation: global.i18n['validation_bank_bik_invalid'],
    required: global.i18n['validation_required'],
  },
  rma_courier: {
    required: global.i18n['validation_required'],
    before_today: global.i18n['validation_date'],
  },
  rma_select: {
    required: global.i18n['validation_required'],
  },
  number: {
    required: global.i18n['validation_required'],
    number: global.i18n['validation_number'],
  },
  delivery_type: {
    required: global.i18n['validation_required'],
  },
};

if (globalRules.customer_address_postcode.min_text_length) {
  rules.postcode.minlength = globalRules.customer_address_postcode.min_text_length;
  messages.postcode.minlength = globalRules.customer_address_postcode.validation_key_min;
}
if (globalRules.customer_address_postcode.max_text_length) {
  rules.postcode.maxlength = globalRules.customer_address_postcode.max_text_length;
  messages.postcode.maxlength = globalRules.customer_address_postcode.validation_key_max;
}
if (globalRules.customer_address_postcode.pattern_validation) {
  rules.postcode.rxpattern = globalRules.customer_address_postcode.pattern_validation;
  messages.postcode.rxpattern = globalRules.customer_address_postcode.validation_key_illegal;
}
if (globalRules.local_postcode) {
  rules.postcode.local_postcode = globalRules.local_postcode.pattern_validation;
  messages.postcode.local_postcode = globalRules.local_postcode.validation_key_illegal;
}

var sinsayValidation = {
  init: function () {
    var _this = this;
    _this.overrideValidation();
    _this.updateDefaultValidation();
    _this.checkout();
    _this.login();
    _this.recoverPassword();
    _this.setPassword();
    _this.register();
    _this.billingAddress();
    _this.methods();
    _this.customerData();
    _this.contactForm();
    _this.rma.init();
  },
  methods: function () {
    jQuery.validator.addMethod('rxpattern', function (value, element, param) {
      return value.match(new RegExp(param));
    });

    jQuery.validator.addMethod('exactlength', function (value, element, param) {
      return this.optional(element) || value.length === parseInt(param, 10);
    });
    jQuery.validator.addMethod('before_today', function (value, element) {
      var date = value.split('.');
      return (
        this.optional(element) ||
        new Date(parseInt(date[2]), parseInt(date[1]) - 1, parseInt(date[0]) + 1).getTime() < new Date().getTime()
      );
    });
    jQuery.validator.addMethod('after_today', function (value, element) {
      var date = value.split('.');
      return (
        this.optional(element) ||
        new Date(parseInt(date[2]), parseInt(date[1]) - 1, parseInt(date[0]) + 1).getTime() > new Date().getTime()
      );
    });
    jQuery.validator.addMethod('bankAccountNumberValidation', function () {
      var input = jQuery('input.bank-nr');

      if (window.isBankAccountNumberValid === true) {
        input.removeClass('error').addClass('valid');
        return true;
      } else {
        input.removeClass('valid').addClass('error');
        return false;
      }
    });
    jQuery.validator.addMethod('minQty', function (value) {
      if (value) {
        return true;
      }
    });
    jQuery.validator.addMethod(
      'isAdult',
      function (value, element, params) {
        var minAge = parseInt(element.dataset.minage),
          pattern = /(\d{2})\.(\d{2})\.(\d{4})/,
          birthdayDate = new Date(value.replace(pattern, '$3-$2-$1')),
          year = birthdayDate.getFullYear(),
          month = birthdayDate.getMonth(),
          day = birthdayDate.getDate();

        if (isNaN(minAge) || minAge == 'undefined' || value === '') {
          return true;
        }

        params[1] = minAge;
        return new Date(year + minAge, month, day) <= new Date();
      },
      global.i18n['validation_is_adult']
    );

    jQuery.validator.addMethod('local_postcode', function (val, el, pattern) {
      return new RegExp(pattern).test(val);
    });

    if (LegacyBridge.getStoreConfig('languageCode') === 'pl_PL') {
      jQuery.validator.addMethod(
        'vatin_validation',
        function (value) {
          return ValidationBridge.constraint.vatin(value);
        },
        global.i18n['validation_vatin_invalid']
      );
    }
  },
  overrideValidation: function () {
    // Nadpisanie jQuery Validate aby nie tworzył elementów formularza w czasie walidacji
    jQuery.fn.validate = function (options) {
      if (!this.length) {
        if (options && options.debug && window.console) {
          console.warn("Nothing selected, can't validate, returning nothing.");
        }

        return;
      }

      var $validator = jQuery.data(this[0], 'validator');

      if ($validator) {
        return $validator;
      }

      this.attr('novalidate', 'novalidate');

      $validator = new jQuery.validator(options, this[0]);
      jQuery.data(this[0], 'validator', $validator);

      if ($validator.settings.onsubmit) {
        this.on('click.validate', ':submit', function (event) {
          var $this = jQuery(this);
          $validator.submitButton = event.currentTarget;

          if ($this.hasClass('cancel') || $this.attr('formnovalidate') !== undefined) {
            $validator.cancelSubmit = true;
          }
        });

        this.on('submit.validate', function (event) {
          if ($validator.settings.debug) {
            event.preventDefault();
          }

          function handleSubmitValidation() {
            var result;

            if ($validator.settings.submitHandler && !$validator.settings.debug) {
              result = $validator.settings.submitHandler.call($validator, $validator.currentForm, event);

              if (result !== undefined) {
                return result;
              }

              return false;
            }

            return true;
          }

          if ($validator.cancelSubmit) {
            $validator.cancelSubmit = false;

            return handleSubmitValidation();
          }

          if ($validator.form()) {
            if ($validator.pendingRequest) {
              $validator.formSubmitted = true;

              return false;
            }

            return handleSubmitValidation();
          } else {
            $validator.focusInvalid();

            return false;
          }
        });
      }

      return $validator;
    };
  },
  updateDefaultValidation: function () {
    var warningClass = 'warning';

    jQuery.validator.setDefaults({
      highlight: function (element, errorClass, validClass) {
        if (element.type === 'radio') {
          this.findByName(element.name).addClass(errorClass).removeClass(validClass);
        } else {
          $(element).addClass(errorClass).removeClass(validClass);
        }

        element.parentElement.classList.remove(warningClass);
      },
      unhighlight: function (element, errorClass, validClass) {
        if (element.type === 'radio') {
          this.findByName(element.name).removeClass(errorClass).addClass(validClass);
        } else {
          $(element).removeClass(errorClass).addClass(validClass);
        }

        element.parentElement.classList.remove(warningClass);
      },
    });
  },
  checkout: function () {
    var $checkoutAddress = jQuery('#checkout-step-address'),
      $checkoutShipping = jQuery('#checkout-step-methods'),
      $checkoutSummary = jQuery('#checkout-step-summary'),
      previousPhoneRequiredValue = rules.phone.required;

    rules.phone.required = globalRules.customer_address_telephone.required_on_checkout;
    if ($checkoutShipping.length) {
      LPP.sinsay.checkout.validation.shipping($checkoutShipping);
    }
    if ($checkoutAddress.length) {
      LPP.sinsay.checkout.validation.address($checkoutAddress, rules, messages);
    }
    if ($checkoutSummary.length) {
      LPP.sinsay.checkout.validation.summary($checkoutSummary);
    }
    rules.phone.required = previousPhoneRequiredValue;
  },
  login: function () {
    var $authorization = jQuery('#authorization');
    if ($authorization.length) {
      $authorization.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        rules: {
          'login[username]': rules.username,
          'login[password]': rules.password,
        },
        messages: {
          'login[username]': messages.username,
          'login[password]': messages.password,
        },
        submitHandler: function (form) {
          var $form = jQuery(form),
            $input = $form.find('input[type=submit]');
          $input.blur();
          if (!$input.hasClass('disabled')) {
            LPP.common
              .openSpinner({
                parentSelector: '.login',
                keepContent: true,
              })
              .then(function () {
                Librarian.authorization($form.serialize(), function (response) {
                  var acceptRulesPopup, acceptRulesSubmit;
                  if (response) {
                    response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                    if (response.status === true) {
                      if (typeof response.content !== 'undefined' && typeof response.content.url !== 'undefined') {
                        document.location.href = response.content.url;
                      } else {
                        window.location.reload();
                      }
                    } else {
                      LPP.common.closeSpinner();
                      if (response.is_terms_accepted === false) {
                        acceptRulesPopup = document.getElementById('acceptRulesPopup');
                        acceptRulesSubmit = acceptRulesPopup.querySelector('#acceptRulesSubmit');
                        acceptRulesPopup.style.display = 'block';
                        acceptRulesSubmit.addEventListener('click', acceptRulesAjax.bind(null, $form));
                      } else {
                        popupOpen('flash', { message: response.message, success: false });
                      }
                    }
                  }
                });
              });
          }
        },
      });
    }
  },
  recoverPassword: function () {
    var $recovery = jQuery('form[data-form="password-recovery"]');
    if ($recovery.length) {
      $recovery.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        rules: {
          email: rules.email,
        },
        messages: {
          email: messages.email,
        },
        submitHandler: function (form) {
          var self = jQuery(form),
            input = self.find('input[type=submit]');
          input.blur();
          if (!input.hasClass('disabled')) {
            LPP.common
              .openSpinner({
                parentSelector: '#customer-password-remind',
                keepContent: true,
              })
              .then(function () {
                Librarian.passwordRecovery(self.serialize(), function (response) {
                  if (response) {
                    response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                    if (response.status) {
                      popupOpen('flash', {
                        message: response.content.message,
                        success: true,
                      });
                      self.find('.login-link').click();
                      self.find('#email').val('');
                    } else {
                      if (response && response.content) {
                        popupOpen('flash', {
                          message: response.content.message,
                          success: false,
                        });
                      }
                    }
                    LPP.common.closeSpinner();
                  }
                });
              });
          }
        },
      });
    }
  },
  setPassword: function () {
    var $newPassword = jQuery('#customer-generate-password-form');
    if ($newPassword.length) {
      $newPassword.validate({
        rules: {
          password: rules.password,
          confirmation: {
            equalTo: 'input[name=password]',
          },
        },
        messages: {
          password: messages.password,
          confirmation: messages.confirmation,
        },
        submitHandler: function (form) {
          LPP.common
            .openSpinner({
              parentSelector: '.new-password',
              keepContent: true,
            })
            .then(function () {
              form.submit();
            });
        },
      });
    }
  },
  register: function () {
    var $registration = jQuery('form[data-form="registration"]');

    LPP.common.togglePasswordField.init();
    LPP.common.disablePasteForField.init('repeatEmail');
    if ($registration.length) {
      if (!this.registerGeoValidation) {
        this.registerGeoValidation = new LPP.common.GeoValidation(rules, false, [], {
          phoneEl: document.querySelectorAll('[name="phone"]')[0],
          dialCodeEl: document.querySelectorAll('[name="dial_code"]')[0],
          phoneElName: '[name="phone"]',
        });
      }

      var warningClass = 'warning';
      this.registerFormValidation = $registration.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
          element.parentElement.classList.remove(warningClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
          element.parentElement.classList.remove(warningClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        rules: {
          firstname: rules.firstname,
          lastname: rules.lastname,
          phone: rules.phone,
          dob: rules.dob,
          gender: rules.gender,
          email: rules.email,
          emailConfirmation: rules.getEmailConfirmation(),
          password: rules.password,
          regulations: rules.regulations,
          general_terms_statement: rules.general_terms_statement,
          'location[street][0]': rules.street,
          'location[street][1]': rules.street_nb,
          'location[city]': rules.city,
          'location[postcode]': rules.postcode,
          'location[additional_information]': rules.additional_information,
        },
        messages: {
          firstname: messages.firstname,
          lastname: messages.lastname,
          phone: messages.phone,
          dob: messages.dob,
          gender: messages.gender,
          emailConfirmation: messages.emailConfirmation,
          email: messages.email,
          password: messages.password,
          regulations: messages.regulations,
          general_terms_statement: messages.general_terms_statement,
          'location[street][0]': messages.street,
          'location[street][1]': messages.street_nb,
          'location[city]': messages.city,
          'location[postcode]': messages.postcode,
          'location[additional_information]': messages.additional_information,
        },
        submitHandler: function (form) {
          var self = jQuery(form),
            input = self.find('input[type=submit]'),
            serializedForm;

          input.blur();
          if (!input.hasClass('disabled')) {
            LPP.common
              .openSpinner({
                parentSelector: '#customer-register-form',
                keepContent: true,
              })
              .then(function () {
                // **** ECOM-8675 ****
                serializedForm = self.serialize();
                serializedForm += '&confirmation=' + encodeURIComponent(self[0].password.value);
                // ****    end    ****

                Librarian.registration(serializedForm, function (response) {
                  if (response) {
                    response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                    if (response.status === true) {
                      var $thanks = jQuery('#customer-register-thanks');
                      $thanks.find('.content').append('<p class="text-valid">{0}</p>'.format(response.content.message));
                      setLoginPane(self.parents('#content > .content'), $thanks);
                      if (typeof response.content.url !== 'undefined' && response.content.url.length > 0) {
                        document.location.href = response.content.url;
                      } else {
                        window.location.reload();
                      }
                    } else {
                      LPP.common.closeSpinner();
                      popupOpen('flash', { message: response.message, success: false });
                    }
                  }
                });
              });
          }
        },
      });

      this.registerGeoValidation.checkValidation(this.registerFormValidation);
    }
  },
  customerData: function () {
    var $customerData = jQuery('#customer-data'),
      $shippingData = jQuery('#customer-shipping-data'),
      warningClass = 'warning';

    if ($customerData.length) {
      if (!this.customerDataGeoValidation) {
        this.customerDataGeoValidation = new LPP.common.GeoValidation(
          rules,
          false,
          [],
          {
            phoneEl: document.querySelectorAll('[name="phone_no"]')[0],
            dialCodeEl: document.querySelectorAll('[name="dial_code"]')[0],
            phoneElName: '[name="phone_no"]',
          },
          false,
          [],
          true
        );
      }
      this.customerDataValidate = $customerData.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          if (jQuery(element).hasClass('phone-number-prefix')) {
            return;
          }

          jQuery(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          if (jQuery(element).hasClass('phone-number-prefix')) {
            return;
          }

          jQuery(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },

        rules: {
          email: rules.email,
          firstname: rules.firstname,
          lastname: rules.lastname,
          dob: rules.dob,
          phone_no: rules.phone_exact,
          current_password: rules.password_optional,
          password: {
            required: function () {
              if (jQuery('#currentPassword').val().length) {
                return true;
              } else {
                return false;
              }
            },
            minlength: globalRules.customer_password_hash.min_text_length,
          },
          confirmation: {
            equalTo: 'input[name=password]',
          },
        },
        messages: {
          email: messages.email,
          firstname: messages.firstname,
          lastname: messages.lastname,
          dob: messages.dob,
          phone_no: messages.phone,
          current_password: messages.password,
          password: messages.password,
          confirmation: messages.confirmation,
        },
        submitHandler: function (form) {
          LPP.common.openSpinner({ parentSelector: '#content', keepContent: true }).then(function () {
            needToConfirm = false;
            saveHashCookie();
            form.submit();
          });
        },
      });

      this.customerDataGeoValidation.checkValidation(this.customerDataValidate);
    }
    if ($shippingData.length) {
      $shippingData.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
          element.parentElement.classList.remove(warningClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
          element.parentElement.classList.remove(warningClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },

        rules: {
          'address[firstname]': rules.firstname,
          'address[lastname]': rules.lastname,
          'address[street0]': rules.street,
          'address[street1]': rules.street_nb,
          'address[street2]': rules.street_nb,
          'address[city]': rules.city,
          'address[postcode]': rules.postcode,
          'address[phone]': rules.phone,
          'address[additional_information]': rules.additional_information,
        },
        messages: {
          'address[firstname]': messages.firstname,
          'address[lastname]': messages.lastname,
          'address[street0]': messages.street,
          'address[street1]': messages.street_nb,
          'address[street2]': messages.street_nb,
          'address[city]': messages.city,
          'address[postcode]': messages.postcode,
          'address[phone]': messages.phone,
          'address[additional_information]': messages.additional_information,
        },
        submitHandler: function (form) {
          LPP.common.openSpinner({ parentSelector: '#content', keepContent: true }).then(function () {
            var $form = jQuery(form);
            needToConfirm = false;
            $form
              .find('.address:hidden :input')
              .not('[disabled=disabled]')
              .each(function () {
                jQuery(this).addClass('diabled-temporary').prop('disabled', true);
              });
            saveHashCookie();
            form.submit();
          });
        },
      });
    }
  },
  billingAddress: function () {
    var $customerInvoices = jQuery('#customer-invoices'),
      isCompanyInvoice = jQuery('#customer-invoices-form-billing-invoice-1').is(':checked'),
      self = this;

    if ($customerInvoices.length) {
      if (!this.billingAdressGeoValidation) {
        this.billingAdressGeoValidation = new LPP.common.GeoValidation(
          rules,
          isCompanyInvoice,
          [
            {
              field: 'invoice1[postcode]',
              validator: 'postcode',
            },
            {
              field: 'invoice1[city]',
              validator: 'city',
            },
            {
              field: 'invoice1[street][0]',
              validator: 'street',
            },
            {
              field: 'invoice1[street][1]',
              validator: 'street_nb',
            },
            {
              field: 'invoice1[firstname]',
              validator: 'firstname',
            },
            {
              field: 'invoice1[lastname]',
              validator: 'lastname',
            },
          ],
          false,
          '#customer-invoices-form-invoice-data-wrapper',
          ['invoice1[company]', 'invoice1[nip]', 'invoice1[vatdph]', 'invoice1[regon]']
        );
      }

      if (this.billingAddressValidate) {
        this.billingAddressValidate.destroy();
      }

      this.billingAddressValidate = $customerInvoices.validate({
        showErrors: function () {
          self.billingAdressGeoValidation.tryDisplayError(self.billingAddressValidate.invalid);

          this.defaultShowErrors();
        },
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
          self.billingAdressGeoValidation.tryDisplayError(self.billingAddressValidate.invalid);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);

          self.billingAdressGeoValidation.tryDisplayError(self.billingAddressValidate.invalid);
        },
        onfocusout: function (element) {
          this.element(element);
        },

        rules: jQuery.extend(
          {
            'invoice1[company]': rules.company,
            'invoice1[vatin]': rules.vatin,
            'invoice1[regon]': rules.regon,
            'invoice1[vatdph]': rules.vatdph,
            'invoice1[pesel]': rules.pesel,
          },
          this.billingAdressGeoValidation.getRules()
        ),
        messages: {
          'invoice1[company]': messages.company,
          'invoice1[vatin]': messages.vatin,
          'invoice1[regon]': messages.regon,
          'invoice1[vatdph]': messages.vatdph,
          'invoice1[street][0]': messages.street,
          'invoice1[street][1]': messages.street_nb,
          'invoice1[city]': messages.city,
          'invoice1[postcode]': messages.postcode,
          'invoice1[firstname]': messages.firstname,
          'invoice1[lastname]': messages.lastname,
          'invoice1[pesel]': messages.pesel,
        },
        submitHandler: function (form) {
          LPP.common.openSpinner({ parentSelector: '#content', keepContent: true }).then(function () {
            needToConfirm = false;
            saveHashCookie();
            form.submit();
          });
        },
      });

      this.billingAdressGeoValidation.checkValidation(this.billingAddressValidate);
    }
  },
  contactForm: function () {
    var $contactForm = jQuery('#contactForm');
    if ($contactForm.length) {
      $contactForm.validate({
        errorPlacement: function (error, element) {
          element.parent().append(error);
        },
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        ignore: [],
        rules: {
          firstname: rules.firstname,
          lastname: rules.lastname,
          customer_email: rules.email,
          department_saved_id: rules.contact_form_select,
          title: rules.contact_form_select,
          comment: {
            required: true,
            pattern: globalRules.customer_address_additional_information.pattern_validation,
          },
          'g-recaptcha-response': rules.g_recaptcha_response,
        },
        messages: {
          firstname: messages.firstname,
          lastname: messages.lastname,
          customer_email: messages.email,
          department_saved_id: messages.contact_form_select,
          title: messages.contact_form_select,
          comment: messages.additional_information,
          'g-recaptcha-response': messages.g_recaptcha_response,
        },
        submitHandler: function (form) {
          LPP.common
            .openSpinner({
              parentSelector: '#contactSection .content',
              keepContent: true,
              headerText: global.i18n.sending_contact_form,
            })
            .then(function () {
              form.submit();
            });
        },
      });
    }
  },
  rma: {
    rmaRules: {
      courier_date: rules.rma_courier,
      'courier[courier_fname]': rules.firstname,
      'courier[courier_lname]': rules.lastname,
      'courier[courier_address1]': rules.street,
      'courier[courier_address2]': rules.street_nb,
      'courier[courier_city]': rules.city,
      'courier[courier_postcode]': rules.postcode,
      element_4: rules.phone,
      'courier[courier_email]': rules.email,
      rma_bank: rules.rma_bank,
      rma_bank_owner: rules.rma_bank_owner,
      rma_bank_owner_firstname: rules.firstname,
      rma_bank_owner_lastname: rules.lastname,
      rma_bank_owner_patronimic: rules.lastname,
      comment: rules.additional_information,
      is_signed: rules.regulations,
    },
    rmaMessages: {
      courier_date: messages.rma_courier,
      'courier[courier_fname]': messages.firstname,
      'courier[courier_lname]': messages.lastname,
      'courier[courier_address1]': messages.street,
      'courier[courier_address2]': messages.street_nb,
      'courier[courier_city]': messages.city,
      'courier[courier_postcode]': messages.postcode,
      element_4: messages.phone,
      'courier[courier_email]': messages.email,
      rma_bank: messages.rma_bank,
      rma_bank_owner: messages.rma_bank_owner,
      rma_bank_owner_firstname: messages.firstname,
      rma_bank_owner_lastname: messages.lastname,
      rma_bank_owner_patronimic: messages.lastname,
      comment: messages.additional_information,
      is_signed: messages.regulations,
    },
    init: function () {
      if (LPP.common.rma.validateRussianAccountNumberEnabled) {
        this.rmaRules.rma_bank = rules.rma_bank_ru_account;
        this.rmaRules.rma_bank_bik_number = rules.rma_bank_bik;
        this.rmaMessages.rma_bank = messages.rma_bank_ru_account;
        this.rmaMessages.rma_bank_bik_number = messages.rma_bank_bik;
      }
      this.complaint();
      this.return();
      this.mailRequest();
    },
    toggleRmaError: function (rmaForm, rmaFieldsetError) {
      var $inputRange = rmaForm.find('.input-range'),
        $rmaFieldsetError = rmaForm.find('#' + rmaFieldsetError);
      $inputRange.on('change', function () {
        var sumInputRange = 0,
          $this = jQuery(this);
        $inputRange.each(function () {
          sumInputRange += parseInt(this.value);
          if (sumInputRange > 0) {
            $rmaFieldsetError.hide();
          } else {
            $rmaFieldsetError.show();
          }
        });
        LPP.common.rma.amountToReturn({
          item: $this.parents('.item-details'),
          amount: $this.val(),
          qtyInput: $this,
          btns: $this.parents('.input-range-wrapper').find('.plus, .minus'),
          priceInput: $this.parents('.item-details').find('.js-product-price'),
        });
      });
    },
    complaint: function () {
      var $complaintForm = jQuery('#rmaComplaintForm');
      if ($complaintForm.length) {
        window.selectReturnForm();
        $complaintForm.find('li.item').each(function (index) {
          $complaintForm.find('input[name="items[' + index + '][qty_requested]"]').change(function () {
            var $this = jQuery(this),
              $inputDate = $complaintForm.find('input[name="items[' + index + '][date]"]'),
              $selectReason = $complaintForm.find('select[name="items[' + index + '][complaint_reason]"]'),
              $selectResolution = $complaintForm.find('select[name="items[' + index + '][resolution]"]');
            $this.rules('add', {
              digits: true,
              messages: {
                digits: global.i18n['validation_digits'],
              },
            });
            if ($this.val() == 0) {
              $inputDate.rules('remove');
              $inputDate.parents('.input-field').find('span.error-icon', 'label.error').remove();
              $selectReason.rules('remove');
              $selectReason.parents('.input-field').find('span.error-icon', 'label.error').remove();
              $selectResolution.rules('remove');
              $selectResolution.parents('.input-field').find('span.error-icon', 'label.error').remove();
            }
            if ($this.val() > 0) {
              $inputDate.rules('add', {
                required: true,
                messages: messages.rma_courier_pickup_date,
              });
              $selectReason.rules('add', {
                required: rules.rma_select.required,
                messages: messages.rma_select,
              });
              $selectResolution.rules('add', {
                required: rules.rma_select.required,
                messages: messages.rma_select,
              });
            }
          });
        });

        this.toggleRmaError($complaintForm, 'complaint-error');

        $complaintForm.validate({
          errorPlacement: function (error, element) {
            element.parent().append(error);
          },
          // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
          highlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(errorClass).removeClass(validClass);
          },
          unhighlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(validClass).removeClass(errorClass);
          },
          onfocusout: function (element) {
            this.element(element);
          },
          rules: this.rmaRules,
          messages: this.rmaMessages,
          submitHandler: function (form) {
            var blocked = true,
              $errorLabel = jQuery('#complaint-error'),
              $bankNumber = jQuery('.bank-nr');
            jQuery('li.item').each(function (index) {
              if (jQuery('input[name="items[' + index + '][qty_requested]"]').val() > 0) {
                blocked = false;
              }
            });
            if (!blocked) {
              $errorLabel.addClass('hidden');
            } else {
              $errorLabel.removeClass('hidden');
              return false;
            }
            if ($bankNumber.is(':visible')) {
              $bankNumber.trigger('change');
              if (!isBankAccountNumberValid) {
                return false;
              }
            }
            LPP.common
              .openSpinner({
                parentSelector: '#complaint .content',
                keepContent: true,
              })
              .then(function () {
                form.submit();
              });
          },
        });
      }
    },
    return: function () {
      var $returnForm = jQuery('#rmaReturnForm');
      if ($returnForm.length) {
        window.selectReturnForm();
        $returnForm.find('li.item').each(function (index) {
          $returnForm.find('input[name="items[' + index + '][qty_requested]"]').change(function () {
            var $this = jQuery(this),
              $selectReason = $returnForm.find('select[name="items[' + index + '][complaint_reason]"]');
            $this.rules('add', {
              digits: true,
              messages: {
                digits: global.i18n['validation_digits'],
              },
            });
            if ($this.val() == 0) {
              $selectReason.rules('remove');
              $selectReason.parents('.input-field').find('span.error-icon', 'label.error').remove();
            }
            if ($this.val() > 0) {
              $selectReason.rules('add', {
                required: rules.rma_select.required,
                messages: messages.rma_select,
              });
            }
          });
        });

        this.toggleRmaError($returnForm, 'return-error');

        $returnForm.validate({
          errorPlacement: function (error, element) {
            element.parent().append(error);
          },
          // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
          highlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(errorClass).removeClass(validClass);
          },
          unhighlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(validClass).removeClass(errorClass);
          },
          onfocusout: function (element) {
            this.element(element);
          },
          rules: this.rmaRules,
          messages: this.rmaMessages,
          submitHandler: function (form) {
            var blocked = true,
              $bankNumber = jQuery('.bank-nr');
            jQuery('#rmaReturnForm')
              .find('li.item')
              .each(function (index) {
                if (jQuery('input[name="items[' + index + '][qty_requested]"]').val() > 0) {
                  blocked = false;
                }
              });
            if (blocked) {
              return false;
            }
            if ($bankNumber.is(':visible')) {
              $bankNumber.trigger('change');
              if (!isBankAccountNumberValid) {
                return false;
              }
            }
            LPP.common
              .openSpinner({
                parentSelector: '#customer-wrapper .content',
                keepContent: true,
              })
              .then(function () {
                form.submit();
              });
          },
        });
      }
    },
    mailRequest: function () {
      var $bankAccountSave = jQuery('#bank-account-save');
      if ($bankAccountSave.length) {
        var rmaRules = {
            rma_bank: rules.rma_bank,
            rma_bank_owner: rules.rma_bank_owner,
            comment: rules.additional_information,
          },
          rmaMessages = {
            rma_bank: messages.rma_bank,
            rma_bank_owner: messages.rma_bank_owner,
            comment: messages.additional_information,
          };

        if (LPP.common.rma.validateRussianAccountNumberEnabled) {
          rmaRules.rma_bank = rules.rma_bank_ru_account;
          rmaRules.rma_bank_bik_number = rules.rma_bank_bik;
          rmaMessages.rma_bank = messages.rma_bank_ru_account;
          rmaMessages.rma_bank_bik_number = messages.rma_bank_bik;
        }

        $bankAccountSave.validate({
          errorPlacement: function (error, element) {
            element.parent().append(error);
          },
          rules: rmaRules,
          messages: rmaMessages,
          submitHandler: function (form) {
            var $bankNumberInfo = jQuery('#bankName');
            if (!isBankAccountNumberValid) {
              $bankNumberInfo.text($bankNumberInfo.data('default')).show();
              return false;
            }
            LPP.common
              .openSpinner({
                parentSelector: '#codMailAccountNumber',
                keepContent: true,
              })
              .then(function () {
                form.submit();
              });
          },
        });
      }
    },
  },
};

// contact form in My Orders
rules['contactFormModal'] = {
  rules: {
    firstname: rules.firstname,
    lastname: rules.lastname,
    email: rules.email,
    department_saved_id: rules.contact_form_select,
    title: rules.contact_form_select,
    content: {
      required: true,
      pattern: globalRules.customer_address_additional_information.pattern_validation,
    },
    'g-recaptcha-response': rules.g_recaptcha_response,
  },
  messages: {
    firstname: messages.firstname,
    lastname: messages.lastname,
    email: messages.email,
    department_saved_id: messages.contact_form_select,
    title: messages.contact_form_select,
    content: messages.additional_information,
    'g-recaptcha-response': messages.g_recaptcha_response,
  },
};

rules['searchOrderCms'] = {
  rules: {
    email: rules.email,
    number: rules.number,
    lastname: rules.lastname,
  },
  messages: {
    email: messages.email,
    number: messages.number,
    lastname: messages.lastname,
  },
};

jQuery(document).ready(function () {
  sinsayValidation.init();
});

function searchBar() {
  var toggleButton = document.getElementById('searchBarToggleButton'),
    searchBar,
    searchForm,
    closeButton,
    inputField,
    overlay;

  if (!toggleButton) {
    return;
  }

  (searchBar = document.getElementById('searchBar')),
    (searchForm = document.getElementById('searchForm')),
    (closeButton = document.getElementById('closeSearchBar')),
    (inputField = document.getElementById('searchField')),
    (overlay = document.getElementById('searchBarOverlay'));

  toggleButton.addEventListener('click', toggleSearchBar);
  closeButton.addEventListener('click', toggleSearchBar);
  overlay.addEventListener('click', toggleSearchBar);
  searchForm.addEventListener('submit', preventNullSubmit);

  function toggleSearchBar() {
    searchBar.classList.toggle('opened');

    if (searchBar.classList.contains('opened')) {
      focusOnSearchInput();
    }
  }

  function focusOnSearchInput() {
    inputField.focus();
  }

  function preventNullSubmit(event) {
    if (inputField.value === '') {
      event.preventDefault();
    }
  }
}

// Dropdown on cms-pages / help

var cmsPagesDropdown = (function() {
  function init() {
    var dropdown = document.querySelector('#cmsPagesMenu'),
      bindedRefreshMenu,
      bindedMenuClickHandler;

    if (!dropdown) {
      return;
    }

    var menuList = dropdown.querySelector('ul'),
      activeEl = menuList.querySelector('li.active');

    //fix do braku klasy w ostatnim elemencie menu
    if (!activeEl) {
      activeEl = menuList.querySelector('li:last-child');
      activeEl.classList.add('active');
    }

    bindedMenuClickHandler = menuClickHandler.bind(null, menuList, activeEl);
    bindedRefreshMenu = refreshMenu.bind(null, menuList, activeEl, bindedMenuClickHandler);

    bindedRefreshMenu();

    var timeoutId;
    window.addEventListener('resize', function() {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(bindedRefreshMenu, 100);
    });
  }

  function refreshMenu(menuList, activeEl, bindedMenuClickHandler) {
    menuList.removeEventListener('click', bindedMenuClickHandler);

    if (window.matchMedia('(max-width: ' + windowWidths.sScreenMax + 'px)').matches) {
      menuList.addEventListener('click', bindedMenuClickHandler);
    } else {
      menuList.classList.remove('is-dropped');
      activeEl.classList.remove('arrow-up');
    }
  }

  function menuClickHandler(menuList, activeEl) {
    menuList.classList.toggle('is-dropped');
    activeEl.classList.toggle('arrow-up');
  }

  return init;
})();

function initPostcodeAutocomplete() {
  if (document.getElementById('customer-register-form')) {
    preconfiguredInit({
      cityInput: 'locationCity',
      streetInput: 'locationStreet',
      buildingNumberInput: 'locationBuilding',
      postcodeInput: 'locationPostcode',
    });
  }

  if (document.getElementById('checkout-step-address-shipping')) {
    preconfiguredInit({
      cityInput: 'city',
      streetInput: 'street1',
      buildingNumberInput: 'street2',
      postcodeInput: 'postcode',
    });
  }

  if (document.getElementById('customer-shipping-data-form')) {
    preconfiguredInit({
      cityInput: 'addressCity',
      streetInput: 'addressStreetName',
      buildingNumberInput: 'addressBuildingNumber',
      postcodeInput: 'addressPostcode',
    });
  }

  function preconfiguredInit(ids) {
    var postcodeWrapper = document.querySelector('.postcode-wrapper'),
      loader = document.createElement('div');
    loader.classList.add('loader');
    postcodeWrapper && postcodeWrapper.append(loader);

    LPP.common.checkout.postcodeAutocomplete.init({
      cityInputId: ids.cityInput,
      streetInputId: ids.streetInput,
      buildingNumberInputId: ids.buildingNumberInput,
      postcodeInputId: ids.postcodeInput,
      hasParentValidationClass: true,
      openPopup: function(content) {
        popupOpen('html', {
          jqueryObject: $('<div><div class="postcode-autocomplete-popup-content">' + content + '</div></div>'),
          id: '',
        });
      },
      closePopup: function() {
        document.querySelectorAll('.popup-container .close-button')[0].click();
      },
    });
  }
}

/**
 * Created by mkasperski on 21.07.2016.
 */

var globalRules = getValidationRules(),
  isVatinRequired = globalRules.customer_address_vatin.min_text_length !== 0,
  isRegonRequired = globalRules.customer_address_regon.min_text_length !== 0;

var rules = {
  password: {
    required: true,
    minlength: globalRules.customer_password_hash.min_text_length,
  },
  password_optional: {
    required: false,
    minlength: globalRules.customer_password_hash.min_text_length,
  },
  firstname: {
    required: true,
    pattern: globalRules.customer_firstname.pattern_validation,
    minlength: globalRules.customer_firstname.min_text_length,
    maxlength: globalRules.customer_firstname.max_text_length,
  },
  lastname: {
    required: true,
    pattern: globalRules.customer_lastname.pattern_validation,
    minlength: globalRules.customer_lastname.min_text_length,
    maxlength: globalRules.customer_lastname.max_text_length,
  },
  email: {
    required: globalRules.customer_email.is_required,
    pattern: globalRules.customer_email.pattern_validation,
  },
  getEmailConfirmation: function () {
    return {
      required: this.email.required,
      pattern: this.email.pattern,
      equalTo: '#registerEmail',
    };
  },
  multiemail: {
    multiemail: globalRules.customer_multiemail.multiemail,
    required: globalRules.customer_multiemail.is_required,
  },
  email_exist: {
    email_exist: globalRules.customer_email_exist.email_exist,
    pattern: globalRules.customer_email.pattern_validation,
    required: globalRules.customer_email_exist.is_required,
  },
  username: {
    pattern: globalRules.customer_username.pattern_validation,
    required: globalRules.customer_username.is_required,
  },
  dialcode: {
    required: globalRules.customer_address_dial_code.is_required,
    pattern: globalRules.customer_address_dial_code.pattern_validation,
    maxlength: globalRules.customer_address_dial_code.max_text_length,
  },
  dialcode_optional: {
    required: globalRules.customer_dialcode_optional.is_required,
    pattern: globalRules.customer_dialcode_optional.pattern_validation,
    maxlength: globalRules.customer_dialcode_optional.max_text_length,
  },
  phone: {
    required: globalRules.customer_address_telephone.is_required,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.max_text_length,
  },
  phone_exact: {
    required: globalRules.customer_phone_number.is_required,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.max_text_length,
  },
  phone_optional: {
    required: false,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.min_text_length,
  },
  phone_optional_exact: {
    required: false,
    pattern: globalRules.customer_phone_number.pattern_validation,
    minlength: globalRules.customer_phone_number.min_text_length,
    maxlength: globalRules.customer_phone_number.max_text_length,
  },
  street: {
    required: globalRules.customer_address_street_name.is_required,
    pattern: globalRules.customer_address_street_name.pattern_validation,
    maxlength: globalRules.customer_address_street_name.max_text_length,
  },
  street_nb: {
    required: globalRules.customer_address_street_number.is_required,
    pattern: globalRules.customer_address_street_number.pattern_validation,
    maxlength: globalRules.customer_address_street_number.max_text_length,
  },
  city: {
    required: globalRules.customer_address_city.is_required,
    pattern: globalRules.customer_address_city.pattern_validation,
    maxlength: globalRules.customer_address_city.max_text_length,
  },
  company: {
    required: true,
    pattern: globalRules.customer_address_company.pattern_validation,
    minlength: globalRules.customer_address_company.min_text_length,
    maxlength: globalRules.customer_address_company.max_text_length,
  },
  postcode: {
    required: globalRules.customer_address_postcode.is_required,
  },
  pesel: {
    required: globalRules.customer_address_pesel.is_required,
    digits: true,
    minlength: globalRules.customer_address_pesel.min_text_length,
    maxlength: globalRules.customer_address_pesel.max_text_length,
  },
  vatin: {
    get vatin_validation() {
      return LegacyBridge.getStoreConfig('languageCode') === 'pl_PL';
    },
    required: isVatinRequired,
    pattern: globalRules.customer_address_vatin.pattern_validation,
  },
  regon: {
    required: isRegonRequired,
    pattern: globalRules.customer_address_regon.pattern_validation,
  },
  vatdph: {
    required: globalRules.customer_address_vatdph.is_required,
    pattern: globalRules.customer_address_vatdph.pattern_validation,
  },
  store: {
    required: globalRules.store.is_required,
  },
  text_optional: {
    required: globalRules.text_optional.is_required,
    pattern: globalRules.text_optional.pattern_validation,
  },
  dob: {
    required: globalRules.customer_dob.is_required,
    isAdult: [true],
  },
  gender: {
    required: globalRules.customer_gender.is_required,
  },
  regulations: {
    required: true,
  },
  general_terms_statement: {
    required: true,
  },
  additional_information: {
    required: globalRules.customer_address_additional_information.is_required,
    pattern: globalRules.customer_address_additional_information.pattern_validation,
    minlength: globalRules.customer_address_additional_information.min_text_length,
    maxlength: globalRules.customer_address_additional_information.max_text_length,
  },
  contact_form_select: {
    required: globalRules.customer_contact_form_select.is_required,
  },
  g_recaptcha_response: {
    required: true,
  },
  rma_bank: {
    bankAccountNumberValidation: true,
    required: true,
  },
  rma_bank_owner: {
    required: true,
    pattern: globalRules.customer_firstname.pattern_validation,
  },
  rma_bank_ru_account: {
    bankAccountNumberValidation: true,
    required: true,
  },
  rma_bank_bik: {
    bankAccountNumberValidation: true,
    required: true,
  },
  rma_courier: {
    required: globalRules.rma_courier_pickup_date.is_required,
  },
  rma_select: {
    required: true,
  },
  number: {
    required: true,
    number: true,
  },
  delivery_type: {
    required: true,
  },
};

function normalizer(value) {
  return value ? value.trim() : '';
}

Object.keys(rules).forEach(function (prop) {
  if (rules[prop].required) {
    rules[prop].normalizer = normalizer;
  }
});

var messages = {
  password: {
    required: globalRules.customer_password_hash.validation_key_required,
    minlength: globalRules.customer_password_hash.validation_key_min,
  },
  password_optional: {
    minlength: globalRules.customer_password_hash.validation_key_min,
  },
  firstname: {
    required: globalRules.customer_firstname.validation_key_required,
    minlength: globalRules.customer_firstname.validation_key_min,
    maxlength: globalRules.customer_firstname.validation_key_max,
    pattern: globalRules.customer_firstname.validation_key_illegal,
  },
  lastname: {
    required: globalRules.customer_firstname.validation_key_required,
    minlength: globalRules.customer_firstname.validation_key_min,
    maxlength: globalRules.customer_firstname.validation_key_max,
    pattern: globalRules.customer_firstname.validation_key_illegal,
  },
  email: {
    required: globalRules.customer_email.validation_key_required,
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  emailConfirmation: {
    equalTo: global.i18n.different_emails,
    required: globalRules.customer_email.validation_key_required,
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  multiemail: {
    multiemail: globalRules.customer_multiemail.multiemail,
    required: globalRules.customer_multiemail.validation_key_illegal,
  },
  email_exist: {
    email_exist: globalRules.customer_email_exist.validation_key_illegal,
    pattern: globalRules.customer_email_exist.validation_key_illegal,
    required: globalRules.customer_email_exist.validation_key_required,
  },
  new_email: {
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  username: {
    required: globalRules.customer_email.validation_key_required,
    pattern: globalRules.customer_email.validation_key_illegal,
  },
  dialcode: {
    required: globalRules.customer_address_dial_code.validation_key_required,
    maxlength: globalRules.customer_address_dial_code.validation_key_max,
    pattern: globalRules.customer_address_dial_code.validation_key_illegal,
  },
  dialcode_optional: {
    required: globalRules.customer_address_dial_code.validation_key_required,
    pattern: globalRules.customer_address_dial_code.pattern_validation,
    maxlength: globalRules.customer_address_dial_code.max_text_length,
  },
  phone: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: globalRules.customer_phone_number.validation_key_min,
    maxlength: globalRules.customer_phone_number.validation_key_max,
  },
  phone_exact: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: global.i18n['validation_length'],
    maxlength: global.i18n['validation_length'],
  },
  phone_optional: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: globalRules.customer_phone_number.validation_key_min,
    maxlength: globalRules.customer_phone_number.validation_key_max,
  },
  phone_optional_exact: {
    required: globalRules.customer_phone_number.validation_key_required,
    pattern: globalRules.customer_phone_number.validation_key_illegal,
    minlength: global.i18n['validation_length'],
    maxlength: global.i18n['validation_length'],
  },
  street: {
    required: globalRules.customer_address_street_name.validation_key_required,
    maxlength: globalRules.customer_address_street_name.validation_key_max,
    pattern: globalRules.customer_address_street_name.validation_key_illegal,
  },
  street_nb: {
    required: globalRules.customer_address_street_number.validation_key_required,
    maxlength: globalRules.customer_address_street_number.validation_key_max,
    pattern: globalRules.customer_address_street_number.validation_key_illegal,
  },
  city: {
    required: globalRules.customer_address_city.validation_key_required,
    maxlength: globalRules.customer_address_city.validation_key_max,
    pattern: globalRules.customer_address_city.validation_key_illegal,
  },
  company: {
    required: globalRules.customer_address_company.validation_key_required,
    minlength: globalRules.customer_address_company.validation_key_min,
    maxlength: globalRules.customer_address_company.validation_key_max,
    pattern: globalRules.customer_address_company.validation_key_illegal,
  },
  postcode: {
    required: globalRules.customer_address_postcode.validation_key_required,
    maxlength: globalRules.customer_address_postcode.validation_key_max,
    pattern: globalRules.customer_address_postcode.validation_key_illegal,
  },
  pesel: {
    required: globalRules.customer_address_pesel.validation_key_required,
    minlength: globalRules.customer_address_pesel.validation_key_min,
    maxlength: globalRules.customer_address_pesel.validation_key_max,
    digits: globalRules.customer_address_pesel.validation_key_illegal,
  },
  vatin: {
    vatin_validation: global.i18n['validation_vatin_invalid'],
    required: globalRules.customer_address_vatin.validation_key_required,
    pattern: globalRules.customer_address_vatin.validation_key_illegal,
  },
  regon: {
    required: globalRules.customer_address_regon.validation_key_required,
    pattern: globalRules.customer_address_regon.validation_key_illegal,
  },
  vatdph: {
    required: globalRules.customer_address_vatdph.validation_key_required,
    pattern: globalRules.customer_address_vatdph.validation_key_illegal,
  },
  store: {
    required: global.i18n['pickpoint'],
  },
  text_optional: {
    required: globalRules.text_optional.is_required,
    pattern: globalRules.text_optional.pattern_validation,
  },
  gender: {
    required: globalRules.customer_gender.validation_key_required,
  },
  dob: {
    required: globalRules.customer_dob.validation_key_required,
  },
  confirmation: {
    required: globalRules.customer_password_hash_confirmation.validation_key_required,
    equalTo: global.i18n['validation_equals_to'],
  },
  regulations: {
    required: global.i18n['regulations_required'],
  },
  general_terms_statement: {
    required: global.i18n['validation_required'],
  },
  additional_information: {
    required: globalRules.customer_address_additional_information.validation_key_required,
    pattern: globalRules.customer_address_additional_information.validation_key_illegal,
    minlength: globalRules.customer_address_additional_information.validation_key_min,
    maxlength: globalRules.customer_address_additional_information.validation_key_max,
  },
  contact_form_select: {
    required: globalRules.customer_contact_form_select.validation_key_required,
  },
  g_recaptcha_response: {
    required: global.i18n['validation_required'],
  },
  rma_bank: {
    bankAccountNumberValidation: global.i18n['validation_bank_invalid'],
    required: global.i18n['validation_required'],
  },
  rma_bank_owner: {
    required: global.i18n['this_field_is_required'],
    pattern: global.i18n['validation_illegal'],
  },
  rma_bank_ru_account: {
    bankAccountNumberValidation: global.i18n['validation_bank_account_invalid'],
    required: global.i18n['validation_required'],
  },
  rma_bank_bik: {
    bankAccountNumberValidation: global.i18n['validation_bank_bik_invalid'],
    required: global.i18n['validation_required'],
  },
  rma_courier: {
    required: global.i18n['validation_required'],
    before_today: global.i18n['validation_date'],
  },
  rma_select: {
    required: global.i18n['validation_required'],
  },
  number: {
    required: global.i18n['validation_required'],
    number: global.i18n['validation_number'],
  },
  delivery_type: {
    required: global.i18n['validation_required'],
  },
};

if (globalRules.customer_address_postcode.min_text_length) {
  rules.postcode.minlength = globalRules.customer_address_postcode.min_text_length;
  messages.postcode.minlength = globalRules.customer_address_postcode.validation_key_min;
}
if (globalRules.customer_address_postcode.max_text_length) {
  rules.postcode.maxlength = globalRules.customer_address_postcode.max_text_length;
  messages.postcode.maxlength = globalRules.customer_address_postcode.validation_key_max;
}
if (globalRules.customer_address_postcode.pattern_validation) {
  rules.postcode.rxpattern = globalRules.customer_address_postcode.pattern_validation;
  messages.postcode.rxpattern = globalRules.customer_address_postcode.validation_key_illegal;
}
if (globalRules.local_postcode) {
  rules.postcode.local_postcode = globalRules.local_postcode.pattern_validation;
  messages.postcode.local_postcode = globalRules.local_postcode.validation_key_illegal;
}

var sinsayValidation = {
  init: function () {
    var _this = this;
    _this.overrideValidation();
    _this.updateDefaultValidation();
    _this.checkout();
    _this.login();
    _this.recoverPassword();
    _this.setPassword();
    _this.register();
    _this.billingAddress();
    _this.methods();
    _this.customerData();
    _this.contactForm();
    _this.rma.init();
  },
  methods: function () {
    jQuery.validator.addMethod('rxpattern', function (value, element, param) {
      return value.match(new RegExp(param));
    });

    jQuery.validator.addMethod('exactlength', function (value, element, param) {
      return this.optional(element) || value.length === parseInt(param, 10);
    });
    jQuery.validator.addMethod('before_today', function (value, element) {
      var date = value.split('.');
      return (
        this.optional(element) ||
        new Date(parseInt(date[2]), parseInt(date[1]) - 1, parseInt(date[0]) + 1).getTime() < new Date().getTime()
      );
    });
    jQuery.validator.addMethod('after_today', function (value, element) {
      var date = value.split('.');
      return (
        this.optional(element) ||
        new Date(parseInt(date[2]), parseInt(date[1]) - 1, parseInt(date[0]) + 1).getTime() > new Date().getTime()
      );
    });
    jQuery.validator.addMethod('bankAccountNumberValidation', function () {
      var input = jQuery('input.bank-nr');

      if (window.isBankAccountNumberValid === true) {
        input.removeClass('error').addClass('valid');
        return true;
      } else {
        input.removeClass('valid').addClass('error');
        return false;
      }
    });
    jQuery.validator.addMethod('minQty', function (value) {
      if (value) {
        return true;
      }
    });
    jQuery.validator.addMethod(
      'isAdult',
      function (value, element, params) {
        var minAge = parseInt(element.dataset.minage),
          pattern = /(\d{2})\.(\d{2})\.(\d{4})/,
          birthdayDate = new Date(value.replace(pattern, '$3-$2-$1')),
          year = birthdayDate.getFullYear(),
          month = birthdayDate.getMonth(),
          day = birthdayDate.getDate();

        if (isNaN(minAge) || minAge == 'undefined' || value === '') {
          return true;
        }

        params[1] = minAge;
        return new Date(year + minAge, month, day) <= new Date();
      },
      global.i18n['validation_is_adult']
    );

    jQuery.validator.addMethod('local_postcode', function (val, el, pattern) {
      return new RegExp(pattern).test(val);
    });

    if (LegacyBridge.getStoreConfig('languageCode') === 'pl_PL') {
      jQuery.validator.addMethod(
        'vatin_validation',
        function (value) {
          return ValidationBridge.constraint.vatin(value);
        },
        global.i18n['validation_vatin_invalid']
      );
    }
  },
  overrideValidation: function () {
    // Nadpisanie jQuery Validate aby nie tworzył elementów formularza w czasie walidacji
    jQuery.fn.validate = function (options) {
      if (!this.length) {
        if (options && options.debug && window.console) {
          console.warn("Nothing selected, can't validate, returning nothing.");
        }

        return;
      }

      var $validator = jQuery.data(this[0], 'validator');

      if ($validator) {
        return $validator;
      }

      this.attr('novalidate', 'novalidate');

      $validator = new jQuery.validator(options, this[0]);
      jQuery.data(this[0], 'validator', $validator);

      if ($validator.settings.onsubmit) {
        this.on('click.validate', ':submit', function (event) {
          var $this = jQuery(this);
          $validator.submitButton = event.currentTarget;

          if ($this.hasClass('cancel') || $this.attr('formnovalidate') !== undefined) {
            $validator.cancelSubmit = true;
          }
        });

        this.on('submit.validate', function (event) {
          if ($validator.settings.debug) {
            event.preventDefault();
          }

          function handleSubmitValidation() {
            var result;

            if ($validator.settings.submitHandler && !$validator.settings.debug) {
              result = $validator.settings.submitHandler.call($validator, $validator.currentForm, event);

              if (result !== undefined) {
                return result;
              }

              return false;
            }

            return true;
          }

          if ($validator.cancelSubmit) {
            $validator.cancelSubmit = false;

            return handleSubmitValidation();
          }

          if ($validator.form()) {
            if ($validator.pendingRequest) {
              $validator.formSubmitted = true;

              return false;
            }

            return handleSubmitValidation();
          } else {
            $validator.focusInvalid();

            return false;
          }
        });
      }

      return $validator;
    };
  },
  updateDefaultValidation: function () {
    var warningClass = 'warning';

    jQuery.validator.setDefaults({
      highlight: function (element, errorClass, validClass) {
        if (element.type === 'radio') {
          this.findByName(element.name).addClass(errorClass).removeClass(validClass);
        } else {
          $(element).addClass(errorClass).removeClass(validClass);
        }

        element.parentElement.classList.remove(warningClass);
      },
      unhighlight: function (element, errorClass, validClass) {
        if (element.type === 'radio') {
          this.findByName(element.name).removeClass(errorClass).addClass(validClass);
        } else {
          $(element).removeClass(errorClass).addClass(validClass);
        }

        element.parentElement.classList.remove(warningClass);
      },
    });
  },
  checkout: function () {
    var $checkoutAddress = jQuery('#checkout-step-address'),
      $checkoutShipping = jQuery('#checkout-step-methods'),
      $checkoutSummary = jQuery('#checkout-step-summary'),
      previousPhoneRequiredValue = rules.phone.required;

    rules.phone.required = globalRules.customer_address_telephone.required_on_checkout;
    if ($checkoutShipping.length) {
      LPP.sinsay.checkout.validation.shipping($checkoutShipping);
    }
    if ($checkoutAddress.length) {
      LPP.sinsay.checkout.validation.address($checkoutAddress, rules, messages);
    }
    if ($checkoutSummary.length) {
      LPP.sinsay.checkout.validation.summary($checkoutSummary);
    }
    rules.phone.required = previousPhoneRequiredValue;
  },
  login: function () {
    var $authorization = jQuery('#authorization');
    if ($authorization.length) {
      $authorization.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        rules: {
          'login[username]': rules.username,
          'login[password]': rules.password,
        },
        messages: {
          'login[username]': messages.username,
          'login[password]': messages.password,
        },
        submitHandler: function (form) {
          var $form = jQuery(form),
            $input = $form.find('input[type=submit]');
          $input.blur();
          if (!$input.hasClass('disabled')) {
            LPP.common
              .openSpinner({
                parentSelector: '.login',
                keepContent: true,
              })
              .then(function () {
                Librarian.authorization($form.serialize(), function (response) {
                  var acceptRulesPopup, acceptRulesSubmit;
                  if (response) {
                    response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                    if (response.status === true) {
                      if (typeof response.content !== 'undefined' && typeof response.content.url !== 'undefined') {
                        document.location.href = response.content.url;
                      } else {
                        window.location.reload();
                      }
                    } else {
                      LPP.common.closeSpinner();
                      if (response.is_terms_accepted === false) {
                        acceptRulesPopup = document.getElementById('acceptRulesPopup');
                        acceptRulesSubmit = acceptRulesPopup.querySelector('#acceptRulesSubmit');
                        acceptRulesPopup.style.display = 'block';
                        acceptRulesSubmit.addEventListener('click', acceptRulesAjax.bind(null, $form));
                      } else {
                        popupOpen('flash', { message: response.message, success: false });
                      }
                    }
                  }
                });
              });
          }
        },
      });
    }
  },
  recoverPassword: function () {
    var $recovery = jQuery('form[data-form="password-recovery"]');
    if ($recovery.length) {
      $recovery.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        rules: {
          email: rules.email,
        },
        messages: {
          email: messages.email,
        },
        submitHandler: function (form) {
          var self = jQuery(form),
            input = self.find('input[type=submit]');
          input.blur();
          if (!input.hasClass('disabled')) {
            LPP.common
              .openSpinner({
                parentSelector: '#customer-password-remind',
                keepContent: true,
              })
              .then(function () {
                Librarian.passwordRecovery(self.serialize(), function (response) {
                  if (response) {
                    response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                    if (response.status) {
                      popupOpen('flash', {
                        message: response.content.message,
                        success: true,
                      });
                      self.find('.login-link').click();
                      self.find('#email').val('');
                    } else {
                      if (response && response.content) {
                        popupOpen('flash', {
                          message: response.content.message,
                          success: false,
                        });
                      }
                    }
                    LPP.common.closeSpinner();
                  }
                });
              });
          }
        },
      });
    }
  },
  setPassword: function () {
    var $newPassword = jQuery('#customer-generate-password-form');
    if ($newPassword.length) {
      $newPassword.validate({
        rules: {
          password: rules.password,
          confirmation: {
            equalTo: 'input[name=password]',
          },
        },
        messages: {
          password: messages.password,
          confirmation: messages.confirmation,
        },
        submitHandler: function (form) {
          LPP.common
            .openSpinner({
              parentSelector: '.new-password',
              keepContent: true,
            })
            .then(function () {
              form.submit();
            });
        },
      });
    }
  },
  register: function () {
    var $registration = jQuery('form[data-form="registration"]');

    LPP.common.togglePasswordField.init();
    LPP.common.disablePasteForField.init('repeatEmail');
    if ($registration.length) {
      if (!this.registerGeoValidation) {
        this.registerGeoValidation = new LPP.common.GeoValidation(rules, false, [], {
          phoneEl: document.querySelectorAll('[name="phone"]')[0],
          dialCodeEl: document.querySelectorAll('[name="dial_code"]')[0],
          phoneElName: '[name="phone"]',
        });
      }

      var warningClass = 'warning';
      this.registerFormValidation = $registration.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
          element.parentElement.classList.remove(warningClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
          element.parentElement.classList.remove(warningClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        rules: {
          firstname: rules.firstname,
          lastname: rules.lastname,
          phone: rules.phone,
          dob: rules.dob,
          gender: rules.gender,
          email: rules.email,
          emailConfirmation: rules.getEmailConfirmation(),
          password: rules.password,
          regulations: rules.regulations,
          general_terms_statement: rules.general_terms_statement,
          'location[street][0]': rules.street,
          'location[street][1]': rules.street_nb,
          'location[city]': rules.city,
          'location[postcode]': rules.postcode,
          'location[additional_information]': rules.additional_information,
        },
        messages: {
          firstname: messages.firstname,
          lastname: messages.lastname,
          phone: messages.phone,
          dob: messages.dob,
          gender: messages.gender,
          emailConfirmation: messages.emailConfirmation,
          email: messages.email,
          password: messages.password,
          regulations: messages.regulations,
          general_terms_statement: messages.general_terms_statement,
          'location[street][0]': messages.street,
          'location[street][1]': messages.street_nb,
          'location[city]': messages.city,
          'location[postcode]': messages.postcode,
          'location[additional_information]': messages.additional_information,
        },
        submitHandler: function (form) {
          var self = jQuery(form),
            input = self.find('input[type=submit]'),
            serializedForm;

          input.blur();
          if (!input.hasClass('disabled')) {
            LPP.common
              .openSpinner({
                parentSelector: '#customer-register-form',
                keepContent: true,
              })
              .then(function () {
                // **** ECOM-8675 ****
                serializedForm = self.serialize();
                serializedForm += '&confirmation=' + encodeURIComponent(self[0].password.value);
                // ****    end    ****

                Librarian.registration(serializedForm, function (response) {
                  if (response) {
                    response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                    if (response.status === true) {
                      var $thanks = jQuery('#customer-register-thanks');
                      $thanks.find('.content').append('<p class="text-valid">{0}</p>'.format(response.content.message));
                      setLoginPane(self.parents('#content > .content'), $thanks);
                      if (typeof response.content.url !== 'undefined' && response.content.url.length > 0) {
                        document.location.href = response.content.url;
                      } else {
                        window.location.reload();
                      }
                    } else {
                      LPP.common.closeSpinner();
                      popupOpen('flash', { message: response.message, success: false });
                    }
                  }
                });
              });
          }
        },
      });

      this.registerGeoValidation.checkValidation(this.registerFormValidation);
    }
  },
  customerData: function () {
    var $customerData = jQuery('#customer-data'),
      $shippingData = jQuery('#customer-shipping-data'),
      warningClass = 'warning';

    if ($customerData.length) {
      if (!this.customerDataGeoValidation) {
        this.customerDataGeoValidation = new LPP.common.GeoValidation(
          rules,
          false,
          [],
          {
            phoneEl: document.querySelectorAll('[name="phone_no"]')[0],
            dialCodeEl: document.querySelectorAll('[name="dial_code"]')[0],
            phoneElName: '[name="phone_no"]',
          },
          false,
          [],
          true
        );
      }
      this.customerDataValidate = $customerData.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          if (jQuery(element).hasClass('phone-number-prefix')) {
            return;
          }

          jQuery(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          if (jQuery(element).hasClass('phone-number-prefix')) {
            return;
          }

          jQuery(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },

        rules: {
          email: rules.email,
          firstname: rules.firstname,
          lastname: rules.lastname,
          dob: rules.dob,
          phone_no: rules.phone_exact,
          current_password: rules.password_optional,
          password: {
            required: function () {
              if (jQuery('#currentPassword').val().length) {
                return true;
              } else {
                return false;
              }
            },
            minlength: globalRules.customer_password_hash.min_text_length,
          },
          confirmation: {
            equalTo: 'input[name=password]',
          },
        },
        messages: {
          email: messages.email,
          firstname: messages.firstname,
          lastname: messages.lastname,
          dob: messages.dob,
          phone_no: messages.phone,
          current_password: messages.password,
          password: messages.password,
          confirmation: messages.confirmation,
        },
        submitHandler: function (form) {
          LPP.common.openSpinner({ parentSelector: '#content', keepContent: true }).then(function () {
            needToConfirm = false;
            saveHashCookie();
            form.submit();
          });
        },
      });

      this.customerDataGeoValidation.checkValidation(this.customerDataValidate);
    }
    if ($shippingData.length) {
      $shippingData.validate({
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
          element.parentElement.classList.remove(warningClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
          element.parentElement.classList.remove(warningClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },

        rules: {
          'address[firstname]': rules.firstname,
          'address[lastname]': rules.lastname,
          'address[street0]': rules.street,
          'address[street1]': rules.street_nb,
          'address[street2]': rules.street_nb,
          'address[city]': rules.city,
          'address[postcode]': rules.postcode,
          'address[phone]': rules.phone,
          'address[additional_information]': rules.additional_information,
        },
        messages: {
          'address[firstname]': messages.firstname,
          'address[lastname]': messages.lastname,
          'address[street0]': messages.street,
          'address[street1]': messages.street_nb,
          'address[street2]': messages.street_nb,
          'address[city]': messages.city,
          'address[postcode]': messages.postcode,
          'address[phone]': messages.phone,
          'address[additional_information]': messages.additional_information,
        },
        submitHandler: function (form) {
          LPP.common.openSpinner({ parentSelector: '#content', keepContent: true }).then(function () {
            var $form = jQuery(form);
            needToConfirm = false;
            $form
              .find('.address:hidden :input')
              .not('[disabled=disabled]')
              .each(function () {
                jQuery(this).addClass('diabled-temporary').prop('disabled', true);
              });
            saveHashCookie();
            form.submit();
          });
        },
      });
    }
  },
  billingAddress: function () {
    var $customerInvoices = jQuery('#customer-invoices'),
      isCompanyInvoice = jQuery('#customer-invoices-form-billing-invoice-1').is(':checked'),
      self = this;

    if ($customerInvoices.length) {
      if (!this.billingAdressGeoValidation) {
        this.billingAdressGeoValidation = new LPP.common.GeoValidation(
          rules,
          isCompanyInvoice,
          [
            {
              field: 'invoice1[postcode]',
              validator: 'postcode',
            },
            {
              field: 'invoice1[city]',
              validator: 'city',
            },
            {
              field: 'invoice1[street][0]',
              validator: 'street',
            },
            {
              field: 'invoice1[street][1]',
              validator: 'street_nb',
            },
            {
              field: 'invoice1[firstname]',
              validator: 'firstname',
            },
            {
              field: 'invoice1[lastname]',
              validator: 'lastname',
            },
          ],
          false,
          '#customer-invoices-form-invoice-data-wrapper',
          ['invoice1[company]', 'invoice1[nip]', 'invoice1[vatdph]', 'invoice1[regon]']
        );
      }

      if (this.billingAddressValidate) {
        this.billingAddressValidate.destroy();
      }

      this.billingAddressValidate = $customerInvoices.validate({
        showErrors: function () {
          self.billingAdressGeoValidation.tryDisplayError(self.billingAddressValidate.invalid);

          this.defaultShowErrors();
        },
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
          self.billingAdressGeoValidation.tryDisplayError(self.billingAddressValidate.invalid);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);

          self.billingAdressGeoValidation.tryDisplayError(self.billingAddressValidate.invalid);
        },
        onfocusout: function (element) {
          this.element(element);
        },

        rules: jQuery.extend(
          {
            'invoice1[company]': rules.company,
            'invoice1[vatin]': rules.vatin,
            'invoice1[regon]': rules.regon,
            'invoice1[vatdph]': rules.vatdph,
            'invoice1[pesel]': rules.pesel,
          },
          this.billingAdressGeoValidation.getRules()
        ),
        messages: {
          'invoice1[company]': messages.company,
          'invoice1[vatin]': messages.vatin,
          'invoice1[regon]': messages.regon,
          'invoice1[vatdph]': messages.vatdph,
          'invoice1[street][0]': messages.street,
          'invoice1[street][1]': messages.street_nb,
          'invoice1[city]': messages.city,
          'invoice1[postcode]': messages.postcode,
          'invoice1[firstname]': messages.firstname,
          'invoice1[lastname]': messages.lastname,
          'invoice1[pesel]': messages.pesel,
        },
        submitHandler: function (form) {
          LPP.common.openSpinner({ parentSelector: '#content', keepContent: true }).then(function () {
            needToConfirm = false;
            saveHashCookie();
            form.submit();
          });
        },
      });

      this.billingAdressGeoValidation.checkValidation(this.billingAddressValidate);
    }
  },
  contactForm: function () {
    var $contactForm = jQuery('#contactForm');
    if ($contactForm.length) {
      $contactForm.validate({
        errorPlacement: function (error, element) {
          element.parent().append(error);
        },
        // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
        highlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(errorClass).removeClass(validClass);
        },
        unhighlight: function (element, errorClass, validClass) {
          $(element).parent('div').addClass(validClass).removeClass(errorClass);
        },
        onfocusout: function (element) {
          this.element(element);
        },
        ignore: [],
        rules: {
          firstname: rules.firstname,
          lastname: rules.lastname,
          customer_email: rules.email,
          department_saved_id: rules.contact_form_select,
          title: rules.contact_form_select,
          comment: {
            required: true,
            pattern: globalRules.customer_address_additional_information.pattern_validation,
          },
          'g-recaptcha-response': rules.g_recaptcha_response,
        },
        messages: {
          firstname: messages.firstname,
          lastname: messages.lastname,
          customer_email: messages.email,
          department_saved_id: messages.contact_form_select,
          title: messages.contact_form_select,
          comment: messages.additional_information,
          'g-recaptcha-response': messages.g_recaptcha_response,
        },
        submitHandler: function (form) {
          LPP.common
            .openSpinner({
              parentSelector: '#contactSection .content',
              keepContent: true,
              headerText: global.i18n.sending_contact_form,
            })
            .then(function () {
              form.submit();
            });
        },
      });
    }
  },
  rma: {
    rmaRules: {
      courier_date: rules.rma_courier,
      'courier[courier_fname]': rules.firstname,
      'courier[courier_lname]': rules.lastname,
      'courier[courier_address1]': rules.street,
      'courier[courier_address2]': rules.street_nb,
      'courier[courier_city]': rules.city,
      'courier[courier_postcode]': rules.postcode,
      element_4: rules.phone,
      'courier[courier_email]': rules.email,
      rma_bank: rules.rma_bank,
      rma_bank_owner: rules.rma_bank_owner,
      rma_bank_owner_firstname: rules.firstname,
      rma_bank_owner_lastname: rules.lastname,
      rma_bank_owner_patronimic: rules.lastname,
      comment: rules.additional_information,
      is_signed: rules.regulations,
    },
    rmaMessages: {
      courier_date: messages.rma_courier,
      'courier[courier_fname]': messages.firstname,
      'courier[courier_lname]': messages.lastname,
      'courier[courier_address1]': messages.street,
      'courier[courier_address2]': messages.street_nb,
      'courier[courier_city]': messages.city,
      'courier[courier_postcode]': messages.postcode,
      element_4: messages.phone,
      'courier[courier_email]': messages.email,
      rma_bank: messages.rma_bank,
      rma_bank_owner: messages.rma_bank_owner,
      rma_bank_owner_firstname: messages.firstname,
      rma_bank_owner_lastname: messages.lastname,
      rma_bank_owner_patronimic: messages.lastname,
      comment: messages.additional_information,
      is_signed: messages.regulations,
    },
    init: function () {
      if (LPP.common.rma.validateRussianAccountNumberEnabled) {
        this.rmaRules.rma_bank = rules.rma_bank_ru_account;
        this.rmaRules.rma_bank_bik_number = rules.rma_bank_bik;
        this.rmaMessages.rma_bank = messages.rma_bank_ru_account;
        this.rmaMessages.rma_bank_bik_number = messages.rma_bank_bik;
      }
      this.complaint();
      this.return();
      this.mailRequest();
    },
    toggleRmaError: function (rmaForm, rmaFieldsetError) {
      var $inputRange = rmaForm.find('.input-range'),
        $rmaFieldsetError = rmaForm.find('#' + rmaFieldsetError);
      $inputRange.on('change', function () {
        var sumInputRange = 0,
          $this = jQuery(this);
        $inputRange.each(function () {
          sumInputRange += parseInt(this.value);
          if (sumInputRange > 0) {
            $rmaFieldsetError.hide();
          } else {
            $rmaFieldsetError.show();
          }
        });
        LPP.common.rma.amountToReturn({
          item: $this.parents('.item-details'),
          amount: $this.val(),
          qtyInput: $this,
          btns: $this.parents('.input-range-wrapper').find('.plus, .minus'),
          priceInput: $this.parents('.item-details').find('.js-product-price'),
        });
      });
    },
    complaint: function () {
      var $complaintForm = jQuery('#rmaComplaintForm');
      if ($complaintForm.length) {
        window.selectReturnForm();
        $complaintForm.find('li.item').each(function (index) {
          $complaintForm.find('input[name="items[' + index + '][qty_requested]"]').change(function () {
            var $this = jQuery(this),
              $inputDate = $complaintForm.find('input[name="items[' + index + '][date]"]'),
              $selectReason = $complaintForm.find('select[name="items[' + index + '][complaint_reason]"]'),
              $selectResolution = $complaintForm.find('select[name="items[' + index + '][resolution]"]');
            $this.rules('add', {
              digits: true,
              messages: {
                digits: global.i18n['validation_digits'],
              },
            });
            if ($this.val() == 0) {
              $inputDate.rules('remove');
              $inputDate.parents('.input-field').find('span.error-icon', 'label.error').remove();
              $selectReason.rules('remove');
              $selectReason.parents('.input-field').find('span.error-icon', 'label.error').remove();
              $selectResolution.rules('remove');
              $selectResolution.parents('.input-field').find('span.error-icon', 'label.error').remove();
            }
            if ($this.val() > 0) {
              $inputDate.rules('add', {
                required: true,
                messages: messages.rma_courier_pickup_date,
              });
              $selectReason.rules('add', {
                required: rules.rma_select.required,
                messages: messages.rma_select,
              });
              $selectResolution.rules('add', {
                required: rules.rma_select.required,
                messages: messages.rma_select,
              });
            }
          });
        });

        this.toggleRmaError($complaintForm, 'complaint-error');

        $complaintForm.validate({
          errorPlacement: function (error, element) {
            element.parent().append(error);
          },
          // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
          highlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(errorClass).removeClass(validClass);
          },
          unhighlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(validClass).removeClass(errorClass);
          },
          onfocusout: function (element) {
            this.element(element);
          },
          rules: this.rmaRules,
          messages: this.rmaMessages,
          submitHandler: function (form) {
            var blocked = true,
              $errorLabel = jQuery('#complaint-error'),
              $bankNumber = jQuery('.bank-nr');
            jQuery('li.item').each(function (index) {
              if (jQuery('input[name="items[' + index + '][qty_requested]"]').val() > 0) {
                blocked = false;
              }
            });
            if (!blocked) {
              $errorLabel.addClass('hidden');
            } else {
              $errorLabel.removeClass('hidden');
              return false;
            }
            if ($bankNumber.is(':visible')) {
              $bankNumber.trigger('change');
              if (!isBankAccountNumberValid) {
                return false;
              }
            }
            LPP.common
              .openSpinner({
                parentSelector: '#complaint .content',
                keepContent: true,
              })
              .then(function () {
                form.submit();
              });
          },
        });
      }
    },
    return: function () {
      var $returnForm = jQuery('#rmaReturnForm');
      if ($returnForm.length) {
        window.selectReturnForm();
        $returnForm.find('li.item').each(function (index) {
          $returnForm.find('input[name="items[' + index + '][qty_requested]"]').change(function () {
            var $this = jQuery(this),
              $selectReason = $returnForm.find('select[name="items[' + index + '][complaint_reason]"]');
            $this.rules('add', {
              digits: true,
              messages: {
                digits: global.i18n['validation_digits'],
              },
            });
            if ($this.val() == 0) {
              $selectReason.rules('remove');
              $selectReason.parents('.input-field').find('span.error-icon', 'label.error').remove();
            }
            if ($this.val() > 0) {
              $selectReason.rules('add', {
                required: rules.rma_select.required,
                messages: messages.rma_select,
              });
            }
          });
        });

        this.toggleRmaError($returnForm, 'return-error');

        $returnForm.validate({
          errorPlacement: function (error, element) {
            element.parent().append(error);
          },
          // TODO: docelowo `higlight`, `unhighlight` i `onfocus` przenieść do init, przy unifikacji wszystkich formularzy
          highlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(errorClass).removeClass(validClass);
          },
          unhighlight: function (element, errorClass, validClass) {
            $(element).parent('div').addClass(validClass).removeClass(errorClass);
          },
          onfocusout: function (element) {
            this.element(element);
          },
          rules: this.rmaRules,
          messages: this.rmaMessages,
          submitHandler: function (form) {
            var blocked = true,
              $bankNumber = jQuery('.bank-nr');
            jQuery('#rmaReturnForm')
              .find('li.item')
              .each(function (index) {
                if (jQuery('input[name="items[' + index + '][qty_requested]"]').val() > 0) {
                  blocked = false;
                }
              });
            if (blocked) {
              return false;
            }
            if ($bankNumber.is(':visible')) {
              $bankNumber.trigger('change');
              if (!isBankAccountNumberValid) {
                return false;
              }
            }
            LPP.common
              .openSpinner({
                parentSelector: '#customer-wrapper .content',
                keepContent: true,
              })
              .then(function () {
                form.submit();
              });
          },
        });
      }
    },
    mailRequest: function () {
      var $bankAccountSave = jQuery('#bank-account-save');
      if ($bankAccountSave.length) {
        var rmaRules = {
            rma_bank: rules.rma_bank,
            rma_bank_owner: rules.rma_bank_owner,
            comment: rules.additional_information,
          },
          rmaMessages = {
            rma_bank: messages.rma_bank,
            rma_bank_owner: messages.rma_bank_owner,
            comment: messages.additional_information,
          };

        if (LPP.common.rma.validateRussianAccountNumberEnabled) {
          rmaRules.rma_bank = rules.rma_bank_ru_account;
          rmaRules.rma_bank_bik_number = rules.rma_bank_bik;
          rmaMessages.rma_bank = messages.rma_bank_ru_account;
          rmaMessages.rma_bank_bik_number = messages.rma_bank_bik;
        }

        $bankAccountSave.validate({
          errorPlacement: function (error, element) {
            element.parent().append(error);
          },
          rules: rmaRules,
          messages: rmaMessages,
          submitHandler: function (form) {
            var $bankNumberInfo = jQuery('#bankName');
            if (!isBankAccountNumberValid) {
              $bankNumberInfo.text($bankNumberInfo.data('default')).show();
              return false;
            }
            LPP.common
              .openSpinner({
                parentSelector: '#codMailAccountNumber',
                keepContent: true,
              })
              .then(function () {
                form.submit();
              });
          },
        });
      }
    },
  },
};

// contact form in My Orders
rules['contactFormModal'] = {
  rules: {
    firstname: rules.firstname,
    lastname: rules.lastname,
    email: rules.email,
    department_saved_id: rules.contact_form_select,
    title: rules.contact_form_select,
    content: {
      required: true,
      pattern: globalRules.customer_address_additional_information.pattern_validation,
    },
    'g-recaptcha-response': rules.g_recaptcha_response,
  },
  messages: {
    firstname: messages.firstname,
    lastname: messages.lastname,
    email: messages.email,
    department_saved_id: messages.contact_form_select,
    title: messages.contact_form_select,
    content: messages.additional_information,
    'g-recaptcha-response': messages.g_recaptcha_response,
  },
};

rules['searchOrderCms'] = {
  rules: {
    email: rules.email,
    number: rules.number,
    lastname: rules.lastname,
  },
  messages: {
    email: messages.email,
    number: messages.number,
    lastname: messages.lastname,
  },
};

jQuery(document).ready(function () {
  sinsayValidation.init();
});

/*exported popupOpen*/
/**
 *
 * @param type
 * @param options
 *
 * types (options in brackets):
 * ajax (url, initialHeight, id, success, onload, close, reload)
 * html (jqueryObject, id, success, onload, close, reload)
 * json (url, initialHeight, id, build(popup, data), success, onload, close, reload),
 * jslib (method, data, initialHeight, id, build(popup, data), success, onload, close),
 * flash (message, success)
 * confirm (message, url)
 */

var popupOpen = (function(i18n, $) {
  var openedPopup,
    popupType,
    popupOptions,
    popupContainer,
    contentWrapper,
    loader = createElement('div', { class: 'spinner' });

  function popupOpen(type, options) {
    popupType = type;
    popupOptions = options;

    if (openedPopup) {
      closePopupHandler();
    }

    hideTiptip();

    var overlay,
      contentLayer = createContentLayer();

    overlay = createElement('div', { id: 'popupOverlay', class: 'overlay' });
    overlay.addEventListener('click', closePopupHandler);
    lockBodyScrolling(overlay, contentLayer);

    popupContainer = createElement('div', { class: 'popup-container' });
    popupContainer.appendChild(overlay);
    popupContainer.appendChild(contentLayer);

    openedPopup = popupContainer;
    // TODO: więcej niż jedno id na stronie
    document.body.insertBefore(popupContainer, document.body.firstChild);

    postActions(type);

    document.addEventListener('keydown', closeOnEsc);
  }

  function postActions(type) {
    var noop = function() {},
      success = popupOptions.success || noop;

    (popupOptions.onload || noop)();
    if (shouldExecuteAdditionalActions(type)) {
      activateDefaultTooltips();
      createCustomFormElements();
    }
    if (typeof success === 'function') {
      success($(popupContainer), closePopupHandler);
    }

    function shouldExecuteAdditionalActions(type) {
      var typesWhichDontNeedAdditionalActions = ['flash', 'confirm'];
      return typesWhichDontNeedAdditionalActions.indexOf(type) === -1;
    }
  }

  function buildPopupContent() {
    var popupContentBuilder = {
      html: buildHtmlContent,
      flash: buildFlashPopup,
      confirm: buildConfirmPopup,
      ajax: buildAjaxPopup,
      jslib: buildJslibContent,
      json: buildJsonContent,
    };

    return popupContentBuilder[popupType]();
  }

  function buildHtmlContent() {
    //TODO:
    var id = popupOptions.id.replace(/#/g, '') || '',
      container = createElement('div', { id: id, class: popupOptions.class || id });
    container.innerHTML = popupOptions.jqueryObject.html();

    return container;
  }

  function buildFlashPopup() {
    var success = popupOptions.success || false,
      flashContent = createElement('p', { class: 'flash-message flash-message-' + (success ? 'success' : 'error') });

    flashContent.textContent = popupOptions.message;

    return flashContent;
  }

  function buildConfirmPopup() {
    var container, form, flashMessage, actionButtons, cancel, confirm;

    confirm = createElement('button', { class: 'confirm-yes button-medium', type: 'submit' });
    confirm.textContent = i18n['yes'];

    cancel = createElement('a', { class: 'confirm-no button-medium' });
    cancel.textContent = i18n['no'];
    cancel.addEventListener('click', closePopupHandler);

    actionButtons = createElement('div', { class: 'actions' });
    actionButtons.appendChild(cancel);
    actionButtons.appendChild(confirm);

    flashMessage = createElement('p', { class: 'flash-message' });
    flashMessage.textContent = popupOptions.message;

    if (popupOptions.isForm) {
      form = createElement('form');
      form.action = popupOptions.url;
      form.method = popupOptions.method || 'get';

      for (var key in popupOptions.data) {
        var input = createElement('input');
        input.name = key;
        input.type = 'hidden';
        input.value = popupOptions.data[key];
        form.appendChild(input);
      }
      container = form;
    } else {
      container = createElement('div');
      confirm.addEventListener('click', function() {
        popupOptions.confirmAction();
        closePopupHandler();
      });
    }

    container.appendChild(flashMessage);
    container.appendChild(actionButtons);

    return container;
  }

  function buildAjaxPopup() {
    $.ajax({
      url: popupOptions.url,
      success: function(data) {
        loader.parentNode.removeChild(loader);
        if (data) {
          contentWrapper.appendChild(typeof data === 'string' ? convertStringToHtmlNode(data) : data);
        } else {
          closePopupHandler();
        }
      },
    });

    return loader;
  }

  function buildJsonContent() {
    var build = popupOptions.build || function() {};

    $.ajax({
      url: popupOptions.url,
      success: function(data) {
        loader.parentNode.removeChild(loader);
        if (data.status) {
          build(popupContainer, data.content);
        }
      },
    });

    return loader;
  }

  function convertStringToHtmlNode(string) {
    var container = createElement('div');
    container.innerHTML = string;

    return container.firstChild;
  }

  function buildJslibContent() {
    Librarian[popupOptions.method](popupOptions.data, function(response) {
      loader.parentNode.removeChild(loader);
      if (response.status) {
        var build = popupOptions.build || function() {};
        build($(popupContainer), response);
      } else {
        closePopupHandler();
        popupOpen('flash', { message: response.message, success: false });
      }
    });

    return loader;
  }

  function lockBodyScrolling() {
    var scrollingElement = document.scrollingElement || document.documentElement,
      scrollTopPosition = scrollingElement.scrollTop;

    document.body.style.position = 'fixed';
    document.body.style.top = -scrollTopPosition + 'px';
  }

  function unlockBodyScrolling() {
    var scrollTopPosition = -parseFloat(document.body.style.top),
      scrollingElement = document.scrollingElement || document.documentElement;

    document.body.style.top = '0';
    document.body.style.position = 'relative';
    scrollingElement.scrollTop = scrollTopPosition;
  }

  function createContentLayer() {
    var closeButton, contentLayer;

    closeButton = createElement('a', { class: 'close-button' });
    closeButton.addEventListener('click', closePopupHandler);

    contentWrapper = createElement('div', { class: 'content-wrapper' });
    contentWrapper.appendChild(buildPopupContent());

    contentLayer = createElement('div', { class: 'content-layer' });
    contentLayer.appendChild(closeButton);
    contentLayer.appendChild(contentWrapper);

    return contentLayer;
  }

  function closePopupHandler() {
    hideTiptip();
    openedPopup.parentNode.removeChild(openedPopup);
    openedPopup = undefined;
    unlockBodyScrolling();
    document.removeEventListener('keydown', closeOnEsc);
  }

  function closeOnEsc(e) {
    if (e.keyCode === KEYCODE_ESC && openedPopup) {
      closePopupHandler();
    }
  }

  function createElement(nodeName, attributes) {
    attributes = attributes || {};
    var element = document.createElement(nodeName);

    Object.keys(attributes).forEach(function(name) {
      element.setAttribute(name, attributes[name]);
    });

    return element;
  }

  function hideTiptip() {
    $('#tiptip_holder').hide();
  }

  return popupOpen;
})(global.i18n, $);

var KEYCODE_ENTER = 13;
var KEYCODE_ESC = 27;
var KEYCODE_ARROW_LEFT = 37;
var KEYCODE_ARROW_RIGHT = 39;

var cookie;
var counter = 0;
var isMobile = false;
var isCommercial = false;
var isCartPage = false;

var data = {
  getBlocks: {},
};

if (typeof console === 'undefined') {
  var console = {
    log: function(argument) {},
  };
}
jQuery.browser = {};
(function() {
  jQuery.browser.msie = false;
  jQuery.browser.version = 0;
  if (navigator.userAgent.match(/MSIE ([0-9]+)\./)) {
    jQuery.browser.msie = true;
    jQuery.browser.version = RegExp.$1;
  }
})();
// Overriding fadeIn method - for IE9
(function() {
  var originalFadeInMethod = jQuery.fn.fadeIn;
  jQuery.fn.fadeIn = function() {
    if ($.browser.msie && $.browser.version === '9') {
      if (arguments.length > 0) {
        arguments[0] = 0;
      } else {
        arguments = [];
        arguments.push(0);
      }
    }

    originalFadeInMethod.apply(this, arguments);
  };
})();

try {
  jQuery(document).ready(function() {
    var $body = jQuery('body');
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent)) {
      isMobile = true;
      $body.addClass('mobile-device');

      if (/iP(hone|ad|od)/i.test(navigator.userAgent)) {
        $body.addClass('ios');
      }
    } else {
      $body.addClass('normal-device');
    }
  });

  (function($) {
    $(window).load(function() {
      $('body').addClass('js-window-load');
    });
  })(jQuery);
} catch (e) {}

var Hist = {
  canPush: function() {
    return typeof window.history.pushState !== 'undefined';
  },
  push: function(url) {
    if (Hist.canPush) {
      window.history.pushState({ url: url }, '', url);
    } else {
      Hist.reload(url);
    }
  },
  reload: function(url) {
    if ($('body').is('#product-view')) {
      window.location = url;
    }
  },
};
if (typeof history.replaceState !== 'undefined') {
  history.replaceState({ url: window.location.href }, '', window.location.href);
}
window.onpopstate = function(event) {
  if (event.state && typeof event.state.url !== 'undefined') {
    Hist.reload(event.state.url);
  }
};

var productAdder = {
  collectData: function(form, single, additional_data) {
    single = single || false;
    additional_data = additional_data || {};
    var data_array = form.serializeArray();
    var data = {};
    for (var i in data_array) {
      if (data_array.hasOwnProperty(i)) {
        var name = data_array[i].name,
          m = name.match(/(.*)\[(.*)\]/),
          value = {};
        if (m) {
          name = m[1];
          value[m[2]] = data_array[i].value;
        } else {
          value = data_array[i].value;
        }
        data[name] = value;
      }
    }
    if (single) {
      if (single !== -1) {
        data = { product: data };
      }
    } else {
      data = { products: { '0': data } };
    }
    data.uenc = global.path.uenc;
    for (var key in additional_data) {
      data[key] = additional_data[key];
    }
    data = $.param(data);
    return data;
  },
};

function sortObject(o) {
  var sorted = {},
    key,
    a = [];

  for (key in o) {
    if (o.hasOwnProperty(key)) {
      a.push(key);
    }
  }

  a.sort();

  for (key = 0; key < a.length; key++) {
    sorted[a[key]] = o[a[key]];
  }
  return sorted;
}

function createCustomFormElements(fixed) {
  fixed = fixed === false ? false : true;

  $.fn.fancyCheckbox = function() {
    this.not('.transformed').each(function() {
      if (!$(this).hasAttr('checked')) {
        $(this).prop('checked', false);
      } else {
        $(this).prop('checked', true);
      }
      $(this).focus(function() {
        $(this).blur();
      });
      var classes = $(this).attr('class') || '';
      $(this)
        .addClass('hidden')
        .attr('tabindex', '-1');
      var checked = $(this).is(':checked');
      var html =
        '<span class="checkbox' +
        (checked ? ' checked' : '') +
        ' ' +
        classes +
        '" data-parent="#' +
        $(this).attr('id') +
        '"></span>';
      $(this).after(html);
      $(this)
        .next()
        .click(function() {
          if (
            $(this)
              .prev()
              .is(':disabled')
          ) {
            return false;
          }
          $(this).toggleClass('checked');
          var checked = $(this).is('.checked');
          $(this)
            .prev('input[type=checkbox]')
            .trigger('click');
          if ($(this).parents('.multiple-select').length) {
            $(this)
              .parent()
              .toggleClass('checked');
          }
        });
      var id = $(this).attr('id');
      $('label[for=' + id + ']').click(function(e) {
        if (!$(e.target).is('a')) {
          e.stopPropagation();
          e.preventDefault();
          var id = $(this).attr('for');
          var obj = $('#' + id);
          if (obj.is('input[type=checkbox]')) {
            obj.next().click();
          }
        }
      });
      $(this).addClass('transformed');
    });
  };
  $('input[type=checkbox]:not(.es-category input[type=checkbox]):not(#is_subscribed_id)').fancyCheckbox();

  $('input[type=radio]:not(.es-category input[type=radio])')
    .not('.transformed')
    .each(function() {
      if (!$(this).hasAttr('checked')) {
        $(this).prop('checked', false);
      } else {
        $(this).prop('checked', true);
      }
      $(this).focus(function() {
        $(this).blur();
      });
      var obj = $(this);
      var classes = $(this).attr('class') || '';
      $(this)
        .addClass('hidden')
        .attr('tabindex', '-1');
      var checked = $(this).is(':checked');
      var html =
        '<span class="radio' +
        (checked ? ' checked' : '') +
        ' ' +
        classes +
        '" data-parent="#' +
        $(this).attr('id') +
        '"></span>';
      $(this).after(html);
      $(this)
        .next()
        .click(function() {
          var name = obj.attr('name');
          $("input[type=radio][name='" + name + "']")
            .prop('checked', false)
            .next()
            .removeClass('checked');
          $(this).addClass('checked');
          $(this)
            .prev('input[type=radio]')
            .prop('checked', true)
            .change();
        });
      var id = $(this).attr('id');
      $('label[for=' + id + ']').click(function(e) {
        e.stopPropagation();
        e.preventDefault();
        var id = $(this).attr('for');
        var obj = $('#' + id);
        if (obj.is('input[type=radio]')) {
          obj.next().click();
        }
      });
      $(this).addClass('transformed');
    });

  $('input[type=text].input-range:not(.es-category input[type=text].input-range)')
    .not('.transformed')
    .each(function() {
      var input = $(this),
        max = input.data('max');
      input.wrap('<div class="input-range-wrapper"></div>');
      var parent = input.parent();
      if (!input.is('[disabled=disabled]')) {
        parent.append('<a class="plus" href="#"></a><a class="minus" href="#"></a>');
      } else {
        parent.append('<span class="plus" href="#"></span><span class="minus" href="#"></span>');
      }
      parent.children('.minus').click(function() {
        if (!input.is('[disabled=disabled]')) {
          var val = parseInt(input.val()) - 1;
          input.val(val).change();
        }
        return false;
      });
      parent.children('.plus').click(function() {
        if (!input.is('[disabled=disabled]')) {
          var val = parseInt(input.val()) + 1;
          if (val <= max) {
            input.val(val).change();
          }
        }
        return false;
      });
      input.change(function() {
        var val = parseInt(input.val());
        if (isNaN(val)) {
          input.val(1);
        } else {
          var min = parseInt(input.data('min'));
          var max = parseInt(input.data('max'));
          if (val < min) {
            input.val(min);
          } else if (val > max) {
            input.val(max);
          }
        }
      });
      input.addClass('transformed');
    });

  $('.overlay .close').click(function() {
    $(this)
      .parents('.overlay')
      .fadeOut();
  });
}

function addScroll(obj, options) {
  var options = options || {},
    option_fixed = options.fixed || false,
    scroll,
    scroll_div;
  if (!obj.data('scroll')) {
    scroll = obj.niceScroll({
      cursorborder: 'none',
      cursorcolor: 'transparent',
      autohidemode: false,
      cursorborderradius: '0',
      cursorfixedheight: 28,
      cursorwidth: 6,
      zindex: options.zindex || 9999,
      horizrailenabled: false,
    });
    scroll_div = $('#' + scroll.id);
    scroll_div.children().addClass('nicescroll-handler');
    scroll_div.prepend(
      '<div class="nicescroll-top"></div><div class="nicescroll-middle"></div><div class="nicescroll-bottom"></div>'
    );
    obj.data('scroll', scroll);

    if (option_fixed) {
      scroll_div.css('position', 'fixed');
    }
  } else {
    scroll = obj.data('scroll');
    scroll_div = $('#' + scroll.id);
  }
  scroll_div.removeClass('hidden');
  return scroll_div;
}

function removeScroll(obj) {
  var scroll = obj.data('scroll') || false;
  if (scroll) {
    $('#' + scroll.id).addClass('hidden');
  }
}

function activateChooseSizeTooltip(obj, show_on_top, type) {
  var show_on_top = show_on_top || false;
  var type = type || 'cart';
  switch (type) {
    case 'cart':
      obj.prop('title', global.i18n['cart_choose_size']);
      break;
    case 'availability':
      obj.prop('title', global.i18n['availability_choose_size']);
      break;
    case 'inform_availability':
      obj.prop('title', global.i18n['inform_availability_choose_size']);
      break;
  }
  obj.tipTip({
    maxWidth: '270px',
    edgeOffset: 8,
    delay: 100,
    defaultPosition: show_on_top ? 'top' : 'bottom',
  });
}

function deactivateTooltip(obj) {
  obj.unbind('mouseenter mouseleave');
  obj.prop('title', '');
}

function deactivateChooseSizeTooltip(obj) {
  deactivateTooltip(obj);
}

function activateDefaultTooltips() {
  $('.tooltip').tipTip({
    maxWidth: '270px',
    defaultPosition: 'top',
    edgeOffset: 8,
    delay: 100,
  });
}

function handleAddToCartButton(obj) {
  obj.click(function(e) {
    if (obj.hasClass('disabled') || obj.hasClass('forced-disabled')) {
      return false;
    }
    if (obj.parents('.product-info').find('.product-sizes .active').length) {
      LPP.common.openSpinner({
        parentSelector: '#product',
        keepContent: true,
        headerText: global.i18n.adding_product_to_cart,
      });

      var formArray = obj.parents('form').serializeArray(),
        productId,
        superAttribute;

      formArray.forEach(function(input) {
        switch (input.name) {
          case 'product_id':
            productId = input.value;
            break;
          case 'super_attribute[327]':
            superAttribute = input.value;
            break;
        }
      });

      LegacyBridge.cartProductAdd(productId, superAttribute).then(function(cart) {
        LPP.common.closeSpinner();
        if (cart.status === true) {
          $('.product-actions')
            .find('.product-go-to-checkout')
            .css('visibility', 'visible');
        } else {
          popupOpen('flash', { message: cart.message, success: false });
        }
      });
    }
    e.preventDefault();
  });
}

function resizeScalableBoxes() {
  $('.scalable-box').each(function() {
    var ratio = $(this).data('ratio');
    var width = $(this).width();
    var height = Math.round(width * ratio);
    $(this).css('height', height + 'px');
    if ($(this).is('.viewport-max')) {
      var max_height = $(window).height() - $('#header').height();
      $(this).css('max-height', max_height + 'px');
    } else if ($(this).is('.viewport-max-inside')) {
      var max_height = $(window).height() - $('#header').height() - 20;
      $(this).css('max-height', max_height + 'px');
    }
  });
}

function addAnalyticsColorClick() {
  if (typeof dataLayer !== 'undefined') {
    var $color = $('#global-popup-1:visible #quickshop dd.product-colors a.active');

    if ($color.length) {
      if (!$color.hasClass('color-clicked')) {
        $color.parent().click();
        $color.addClass('color-clicked');
      }
    }
  }
}

//last viewed begin
var _LAST_VIEWED_URLS_ = 'LAST_VIEWED_IDS';
var last_viewed_ids;
var current_url = '' + window.location + '';
var base_url = '';
var curr_product_temp = '';

function handleLastViewedProducts() {
  var $productsLastWatched = jQuery('#products-last-watched');

  if (jQuery('#last_viewed_base_url').html() !== undefined && jQuery('#last_viewed_base_url').html() !== null) {
    base_url = jQuery('#last_viewed_base_url').html();
  }

  if ($productsLastWatched.html() === undefined || $productsLastWatched.html() === null) {
    return false;
  }

  last_viewed_ids = [];
  var viewed_cookie = jQuery.cookie(_LAST_VIEWED_URLS_);
  if (viewed_cookie !== undefined && viewed_cookie !== null) {
    last_viewed_ids = viewed_cookie.split(',');
    var productMiniCount = 0;
    last_viewed_ids.reverse();
    for (var index = 0; index < last_viewed_ids.length; ++index) {
      var _id = last_viewed_ids[index];
      if (window['curr_product'] != undefined && _id == curr_product) {
        continue;
      }
      if (productMiniCount >= 4) {
        break;
      }
      var data = { product: _id };
      if (window['curr_product_category'] != undefined) {
        data.current_category = curr_product_category;
      }
      Librarian.getProduct(data, function(response, status) {
        if (response.status === false) {
          return false;
        }
        data = response.content.product_preview;

        var sec = new Date().getTime();

        data = data.replace('curr_product', 'curr_product_' + sec);

        var temp = jQuery("<div id='product_temp_" + sec + "' style='display:none'></div>");
        $productsLastWatched.after(temp);
        temp.html(data);

        var div = temp.find('#last_viewed_miniature');
        $productsLastWatched.children('h3').removeClass('hidden');
        $productsLastWatched.append(div).fadeIn();
        $productsLastWatched
          .children('div')
          .removeAttr('id')
          .fadeIn();

        temp.remove();
      });
      productMiniCount++;
    }
    last_viewed_ids.reverse();
  }

  if (jQuery('#last_viewed_miniature').html() !== undefined && jQuery('#last_viewed_miniature').html() !== null) {
    toggleLastViewedProducts();
  }
}

function toggleLastViewedProducts() {
  var current_id_position = $.inArray(curr_product, last_viewed_ids);

  if (current_id_position != -1) {
    last_viewed_ids.splice(current_id_position, 1);
  }
  if (last_viewed_ids.length == 11) {
    last_viewed_ids.shift();
  }
  current_id_position = $.inArray(curr_product, last_viewed_ids);
  if (current_id_position == -1) {
    last_viewed_ids.push(curr_product);
  }
  jQuery.cookie(_LAST_VIEWED_URLS_, last_viewed_ids, { path: '/' });
}

function urlEncoder(url) {
  return encodeURIComponent(url);
}

function urlDecoder(url) {
  return decodeURIComponent(url);
}
//last viewed end

function selectSizeInfo($actionButton, $sizes, event) {
  if ($sizes.find('.active').length) {
    return;
  }
  event.preventDefault();
  popupOpen('html', {
    jqueryObject: $sizes,
    id: 'selectSize',
    class: 'product-sizes popup',
  });

  var $popup = jQuery('#selectSize');

  $popup.prepend('<h3>' + global.i18n.inform_availability_choose_size + ':</h3>');
  $popup.find('.size').on('click', function() {
    var $productId = jQuery(this).data('product-id'),
      isAddToCartButton = $actionButton.is('#productAddToCart');
    $sizes.find('.size').each(function() {
      var $size = jQuery(this);
      if ($size.data('product-id') === $productId) {
        $size.click();
        if (isAddToCartButton) {
          if ($size.hasClass('unavailable')) {
            $sizes
              .parents('.product-info')
              .find('.product-inform-availability')
              .click();
          } else {
            $actionButton.click();
            $popup
              .parents('.content-layer')
              .find('.close-button')
              .click();
          }
        } else {
          $actionButton.click();
        }
      }
    });
  });
}

(function($) {
  $(document).ready(function() {
    // Labels

    var label_duration = 250;
    $('.input.text').each(function() {
      if ($(this).val() != '') {
        $(this)
          .parent()
          .children('label')
          .fadeTo(0, 0)
          .hide();
      }
    });
    $('.input.text label').click(function() {
      $(this)
        .stop()
        .fadeTo(label_duration, 0, function() {
          $(this).hide();
        });
      $(this)
        .parent()
        .children('input')[0]
        .focus();
    });
    $('.input.text input')
      .focus(function() {
        $(this)
          .parent()
          .children('label')
          .stop()
          .fadeTo(label_duration, 0, function() {
            $(this).hide();
          });
      })
      .blur(function() {
        if ($(this).val() == '') {
          $(this)
            .parent()
            .children('label')
            .stop()
            .show()
            .fadeTo(label_duration * 2, 1);
        }
      });

    var $dropdownSubmenu = $('.drop-down-sub-menu');

    $dropdownSubmenu.find('> li > ul .header-4 > a, > li > ul .header-3 > a').replaceWith(function() {
      return $('<span>' + $(this).html() + '</span>');
    });

    $dropdownSubmenu.find('> li').each(function() {
      var $closestUl = $(this).find('> ul');
      if ($closestUl.length === 1 && $('body').hasClass('normal-device')) {
        $closestUl
          .css({
            width: '100%',
          })
          .parent()
          .css({
            width: '150px',
          });
      }
    });

    // Scalable boxes

    $('.scalable-box').each(function() {
      var ratio = 1;
      var x = parseInt($(this).data('x'));
      var y = parseInt($(this).data('y'));
      if (y) {
        ratio = y / x;
      }
      $(this).data('ratio', ratio);
    });
    resizeScalableBoxes();
    $(window).resize(function() {
      resizeScalableBoxes();
    });

    // Custom form elements

    createCustomFormElements();

    // Product colors & sizes

    if (!$('body').is('#category') || $('.bxslider-lookbook').length) {
      $(document).on('click', '.product-colors a', function() {
        var $this = $(this);

        if (!$this.hasClass('product-mini-quickshop')) {
          if (!$this.parents('.product-colors').hasClass('colors-wrapper')) {
            // Tylko jesli mozna wybierac rozmiary
            return false;
          }

          var $parent = $this.parent(),
            $sizes = $this.parents('dl').find('.sizes-wrapper'),
            $productInfo = $this.parents('.product-info'),
            $addToCart = $productInfo.find('.product-add-to-cart'),
            $informOnAvailability = $productInfo.find('.product-inform-availability'),
            $productAvailability = $productInfo.find('.product-availability'),
            selectedSize = $sizes.children('.active').text();

          $parent.children('.active').removeClass('active');
          $this.addClass('active');

          $sizes.html('');
          if ($this.data('sizes') && $this.data('sizes').length) {
            $.each($this.data('sizes'), function() {
              var size = $('<a>')
                .addClass('size')
                .attr('data-product-id', this.product_id)
                .attr('href', '#')
                .text(this.size)
                .append($('<div class="line left-line"></div><div class="line right-line"></div>'));
              if (!this.available) {
                size.addClass('unavailable');
              }
              if (this.size == selectedSize) {
                size.addClass('active');
              }
              size.data('id', this.size_id);
              if ($this.data('sizes').length == 1) {
                size.addClass('active one-size');
              }
              $sizes.append(size);
            });
          }
          var $activeSize = $sizes.find('.active');
          if ($activeSize.length) {
            if ($activeSize.is('.unavailable')) {
              $addToCart.hide();
              $informOnAvailability.show();
              $informOnAvailability.removeClass('disabled');
            } else {
              $addToCart.show();
              $informOnAvailability.hide();
            }

            $activeSize.click();
          } else {
            if ($sizes.find('a:not(.unavailable)').length) {
              $addToCart.show();
              $informOnAvailability.hide();
            } else {
              $addToCart.hide();
              $informOnAvailability.show();
            }
          }
          $addToCart.on('click', selectSizeInfo.bind(null, $addToCart, $sizes));
          $productAvailability.on('click', selectSizeInfo.bind(null, $productAvailability, $sizes));
          $informOnAvailability.on('click', selectSizeInfo.bind(null, $informOnAvailability, $sizes));
          if ($parent.children('.loaded').length) {
            if (!$this.is('.loaded')) {
              var url = $this.attr('data-url'),
                $oldProduct = $('#product'),
                productHeight = $oldProduct.find('.product-image-main img').height();
              $oldProduct
                .find('.product-images-wrapper')
                .children()
                .addClass('hidden');

              $.ajax({
                url: url,
                success: function(data) {
                  if (data.status) {
                    if (Hist.canPush()) {
                      var $newProduct = $('#product'),
                        $newImages = $(data.content.product_info),
                        newMobileImages = $newImages.filter('.product-mobile-slider')[0],
                        newProductHtml = $('<div>' + data.content.product_preview + '</div>'),
                        newControlsHtml = $('<div>' + data.content.product_controls + '</div>');
                      $parent.children('.loaded').removeClass('loaded');
                      $this.addClass('loaded');
                      $newImages = $newImages.filter(function(index, element) {
                        if (element.className) {
                          return element.className.indexOf('mobile') === -1;
                        }

                        return true;
                      });
                      $newImages
                        .find('.product-images-wrapper')
                        .children()
                        .hide();
                      $newProduct.find('.product-images').replaceWith($newImages);
                      newProductHtml.find('.product-replacable').each(function() {
                        var $this = $(this);
                        $('#product-view')
                          .find('.product-replacable[data-replaceindex="' + $this.data('replaceindex') + '"]')
                          .replaceWith($this);
                      });
                      newControlsHtml.find('.product-replacable').each(function() {
                        var $this = $(this);
                        $('#product-view')
                          .find('.product-replacable[data-replaceindex="' + $this.data('replaceindex') + '"]')
                          .replaceWith($this);
                      });
                      $newProduct
                        .find('.product-images-wrapper')
                        .children()
                        .show(1, function() {
                          $newProduct.find('.product-images-thumbs').height(productHeight);
                        });

                      if ($('#recommendedProducts').length) {
                        $('#recommendedProducts').replaceWith(data.content.product_aside);
                      } else {
                        $('#content')
                          .children()
                          .first()
                          .after(data.content.product_aside);
                      }

                      Hist.push(data.content.url);
                    } else {
                      Hist.reload(data.content.url);
                    }
                  } else {
                    popupOpen('flash', {
                      message: data.message,
                      success: false,
                    });
                  }
                },
              });
            }
          } else {
            $this.addClass('loaded');
          }

          $this
            .parents('form')
            .find('input[name=product_id]')
            .val($this.data('product-id'));
        }
        return false;
      });
      $(document).on('click', '.product-sizes .sizes-wrapper > a', function() {
        var $this = $(this),
          $parent = $this.parent(),
          $productInfo = $this.parents('.product-info'),
          $addToCart = $productInfo.find('.product-add-to-cart'),
          $productAvailability = $productInfo.find('.product-availability'),
          $informOnAvailability = $productInfo.find('.product-inform-availability');

        $parent.children('.active').removeClass('active');
        $this.addClass('active');
        $this
          .parents('form')
          .find('#product-size-select > select')
          .val($this.data('id'));
        $productAvailability.removeClass('disabled');

        if ($this.is('.unavailable')) {
          $addToCart.hide().addClass('disabled');
          $informOnAvailability.removeClass('disabled').show();
        } else {
          $addToCart.removeClass('disabled').show();
          $informOnAvailability.hide().addClass('disabled');
        }
        return false;
      });

      $.fn.setUpColors = function() {
        $.each(this, function() {
          var el = $(this),
            config = eval(el.data('colors')),
            colors = el.find('.colors-wrapper'),
            sizes = el.find('.sizes-wrapper');

          if (el.data('processed')) {
            return false;
          }
          $.each(config, function() {
            var color = $('<a>')
              .attr({
                href: this.href,
                'data-url': this.url,
                title: this.label,
              })
              .attr('data-id', this.color_id)
              .attr('data-product-id', this.product_id)
              .addClass('tooltip')
              .addClass('unavailable')
              .data('sizes', this.sizes)
              .append(
                $(
                  '<div class="line left-line"></div><div class="line right-line"></div>' +
                    '<img alt="' +
                    this.label +
                    '" src="' +
                    (this.img ? this.img : color_circle_images.blank) +
                    '" class="bg" style="background-color: ' +
                    this.css +
                    ';">'
                )
              );
            if (this.active) {
              color.addClass('active');
            }

            if (this.sizes.length) {
              $.each(this.sizes, function() {
                if (this.available) {
                  color.removeClass('unavailable');
                }
              });
            }

            colors.append(color);
          });
          el.data('processed', 1);
          colors
            .find('a.active')
            .not('.product-mini-quickshop')
            .trigger('click');
        });
      };

      $('*[data-colors]').setUpColors();
    }

    jQuery('.sizes-table-header')
      .click(function(ev) {
        var elem = $(this);
        var table = elem.siblings('.product-sizes-table-wrapper');

        if (table.hasClass('sizes-unhide')) {
          elem.removeClass('opened');
          table.slideUp(500);
          table.removeClass('sizes-unhide');
        } else {
          elem.addClass('opened');
          table.slideDown(500);
          table.addClass('sizes-unhide');
        }
      })
      .each(function() {
        $(this).append('<span class="handler"></span>');
      });

    if ($('.bxslider-lookbook').length) {
      var lookbook_quickshop = { products: [] };
      $('.lookbook-quickshop').each(function() {
        if ($(this).data('sku')) {
          lookbook_quickshop.products.push($(this).data('sku'));
        }
      });
      if (lookbook_quickshop.products.length) {
        Librarian.checkProducts(lookbook_quickshop, function(response) {
          if (response.status) {
            for (var i in response.content.products) {
              var p = response.content.products[i];
              if (typeof p.id !== 'undefined') {
                $('.lookbook-quickshop[data-sku="' + p.sku + '"]').each(function() {
                  $(this)
                    .addClass('product-mini-quickshop')
                    .attr('href', p.url);
                  $(this)
                    .children('.name')
                    .html(p.name);
                  $(this)
                    .children('.price')
                    .html(p.promo_price ? p.promo_price : p.price);
                  if (p.avv !== 1) {
                    $(this).addClass('unavailable');
                  }
                });
              } else {
                $('.lookbook-quickshop[data-sku="' + p.sku + '"]')
                  .parent()
                  .remove();
              }
            }
            $('.lookbook-quickshop')
              .not('.product-mini-quickshop')
              .parent()
              .remove();
            $('.inline-box .tag').each(function() {
              if ($(this).find('ul > li').length) {
                $(this).removeClass('hidden');
              }
            });
          }
        });
      }
    }

    // Quick shop

    $(document).on('click', '.product-mini-quickshop', function(event) {
      var url = $(this).attr('href');

      if ($(this).hasClass('lookbook-quickshop')) {
        return;
      }
      event.preventDefault();

      popupOpen('json', {
        url: url,
        build: function(popup, data) {
          var $popup = $(popup),
            $quickshopTemplate = $($('#quickshop-container').html()),
            colors = [],
            sizes = [],
            $desktopMainImage = $quickshopTemplate.find('.product-image-main').children('img'),
            $firstImage = $('<img src="' + data.images[0] + '">'),
            $addToCartButton = $quickshopTemplate.find('.product-add-to-cart'),
            thumbTemplate,
            indexOfImage,
            img,
            thumb;

          if (!$('.popup-container').length) {
            return;
          }

          $quickshopTemplate.removeAttr('id');
          $quickshopTemplate.addClass('quickshop');
          if (data.is_coming) {
            $quickshopTemplate.find('.product-info').addClass('comming-soon');
          }

          $desktopMainImage.attr('src', data.images[0]);

          thumbTemplate = $quickshopTemplate.find('.thumb-template').html();
          for (indexOfImage in data.images) {
            img = data.images[indexOfImage];
            thumb = $(thumbTemplate);
            thumb
              .children('a')
              .data('img-big', img)
              .children('img')
              .attr('src', img);
            $quickshopTemplate.find('.product-images-thumbs > div').append(thumb);
            $quickshopTemplate.find('.quickshop-mobile-slider .slide-container').append('<img src="' + img + '">');
          }
          $quickshopTemplate.find('.navigation-dots').empty();
          $quickshopTemplate.find('.thumb:first-child').addClass('first top active');
          $quickshopTemplate.find('.thumb:last-child').addClass('last');
          if (data.images.length <= 4) {
            $quickshopTemplate.find('.product-images-thumbs > a').hide();
          }
          if (data.original_price) {
            $quickshopTemplate
              .find('.product-prices .old-price .amount')
              .html(data.original_price.toFixed(2).replace(/\./, ','));
            $quickshopTemplate
              .find('.product-prices .new-price .amount')
              .html(data.price.toFixed(2).replace(/\./, ','));
            $quickshopTemplate.find('.product-prices .one-price').hide();
          } else {
            $quickshopTemplate
              .find('.product-prices .one-price .amount')
              .html(data.price.toFixed(2).replace(/\./, ','));
            $quickshopTemplate
              .find('.product-prices .price')
              .not('.one-price')
              .hide();
          }
          $quickshopTemplate.find('.product-name').html(data.name);
          $quickshopTemplate.find('.product-manufacturer-code span').html(data.sku);
          $quickshopTemplate.find('.product-sizes-table').remove();
          $quickshopTemplate.find('.sizes-info').attr('href', data.size_guide_url);
          $quickshopTemplate.find('.sizes-info').prop('title', quickshopMisc.txt.sizeTable);
          $quickshopTemplate
            .find('.product-size-select > select')
            .attr('name', 'super_attribute[' + data.size_attr_id + ']');
          $quickshopTemplate.find('.go-to-product').attr('href', data.url);

          $(data.sizes).each(function() {
            $quickshopTemplate
              .find('.product-size-select > select')
              .append('<option value="' + this.value + '">' + this.size + '</option>');
            $quickshopTemplate
              .find('.sizes-wrapper')
              .append('<a ' + (this.in_stock ? '' : 'class="unavailable" ') + 'href="#">' + this.size + '</a>');
          });

          $(data.sizes).each(function() {
            sizes.push({
              size: this.size,
              size_id: this.value,
              available: this.in_stock,
            });
          });

          $(data.colors).each(function() {
            colors.push({
              color_id: this.color_id,
              product_id: this.product_id ? this.product_id : data.product_id,
              url: quickshopMisc.url.ajax.quickshop + (this.product_id ? this.product_id : data.product_id),
              active: parseFloat(this.product_id) === parseFloat(data.product_id),
              sizes:
                parseFloat(this.product_id) === parseFloat(data.product_id)
                  ? sizes
                  : [{ size: 'avv', size_id: 'avv', available: this.avv == 1 }],
              css: this.color_css,
              img: this.color_url,
              label: this.color_label,
            });
          });

          $quickshopTemplate.find('dl').attr('data-colors', JSON.stringify(colors));
          $quickshopTemplate.find('input[name=product_id]').val(data.product_id);
          $quickshopTemplate.find('form.product-info').attr('data-rmsbrand', data.brand);
          $popup.find('.content-wrapper').append($quickshopTemplate);

          handleAddToCartButton($addToCartButton);
          $quickshopTemplate.find('*[data-colors]').setUpColors();
          $quickshopTemplate.find('.colors-wrapper > a').addClass('product-mini-quickshop');
          $quickshopTemplate.find('.sizes-wrapper .active').trigger('click');
          addAnalyticsColorClick();

          $quickshopTemplate.find('.product-images-thumbs .thumb').click(function changeMainImageSrc() {
            var imgSrc = $(this)
              .find('img')
              .attr('src');
            $desktopMainImage.attr('src', imgSrc);
          });

          $quickshopTemplate.find('.product-add-to-cart').on('click', function showMessageIfNeeded() {
            var $message;
            if (!$('.quickshop .sizes-wrapper .active').length) {
              $message = $quickshopTemplate.find('.message');
              $message.text(global.i18n.cart_choose_size).fadeIn();
              setTimeout(function hideMessage() {
                $message.fadeOut();
              }, 2000);
            }
          });
        },
      });
    });

    activateDefaultTooltips();

    // Product thumbnails

    $(document).on('click', '.product-images-thumbs-prev', function() {
      slideThumbnails(
        $(this)
          .parent()
          .children('div'),
        false
      );
      return false;
    });
    $(document).on('click', '.product-images-thumbs-next', function() {
      slideThumbnails(
        $(this)
          .parent()
          .children('div'),
        true
      );
      return false;
    });
    $(document).on('dragstart', '.product-images-thumbs > div > .thumb > a', function(event) {
      event.preventDefault();
      return false;
    });
    $('#product-view').on('click', '.thumb a', function() {
      var $this = $(this),
        $parent = $this.parents('.thumbs > div');

      $parent.find('.active').removeClass('active');
      $this.parent().addClass('active');

      slideThumbnailsTo($parent, $this.parent(), $this.data('img-key'));

      $parent
        .parent()
        .next()
        .children('img')
        .attr('src', $this.data('img-big'));
    });

    // Misc popups

    $('.contact-popup-opener').click(function() {
      var url = $(this).attr('href');
      popupOpen('ajax', {
        url: url,
        id: 'contact-wrapper',
        initialHeight: 674,
        success: function() {
          $('#contact form').validate({
            messages: {
              agree: global.i18n['above_conditions'],
            },
            rules: {
              email: {
                real_email: true,
              },
            },
          });
        },
      });
      return false;
    });

    $('.returns-policy-popup-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#returns-policy-container'), id: 'returns-policy-wrapper' });
      return false;
    });

    $('.shipping-costs-popup-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#shipping-costs-container'), id: 'shipping-costs-wrapper' });
      return false;
    });

    $('.payuplpro-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#payment-method-payu-container'), id: 'payment-method-payu-wrapper' });
      return false;
    });

    $('.paypal_express-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#payment-method-paypal-container'), id: 'payment-method-paypal-wrapper' });
      return false;
    });

    $('.cashondelivery-info-opener').click(function() {
      popupOpen('html', {
        jqueryObject: $('#payment-method-cashondelivery-container'),
        id: 'payment-method-cashondelivery-wrapper',
      });
      return false;
    });

    $('.payu_account-info-opener').click(function() {
      popupOpen('html', {
        jqueryObject: $('#payment-method-payu_account-container'),
        id: 'payment-method-payu_account-wrapper',
      });
      return false;
    });

    $('.lpp_newpayu_hub_card-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#paymentMethodCartContainer'), id: 'paymentMethodLppNewpayuWrapper' });
      return false;
    });

    $('.lpp_newpayu_hub_qiwi-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#paymentMethodQiwiContainer'), id: 'paymentMethodLppNewpayuWrapper' });
      return false;
    });

    $('.lpp_newpayu_hub_webmoney-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#paymentMethodWebmoneyContainer'), id: 'paymentMethodLppNewpayuWrapper' });
      return false;
    });

    $('.lpp_newpayu-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#paymentMethodLppNewpayuContainer'), id: 'paymentMethodLppNewpayuWrapper' });
      return false;
    });

    $('.lpp_klarna-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#paymentMethodKlarnaContainer'), id: 'paymentMethodKlarnaWrapper' });
      return false;
    });

    $('.regulations').click(function() {
      popupOpen('html', { jqueryObject: $('#global-terms-container'), id: 'global-terms-wrapper' });
      return false;
    });

    $('.lpp_yandex-info-opener').click(function() {
      popupOpen('html', { jqueryObject: $('#paymentMethodYandexContainer'), id: 'paymentMethodYandexWrapper' });
      return false;
    });

    // error pages back links

    $('a#go-back-link').click(function() {
      history.back();
    });

    $('.product-sizes-table').on('click', function() {
      var url = $(this).attr('href');
      popupOpen('ajax', { url: url, id: 'product-sizes-wrapper', initialHeight: 387 });
      return false;
    });

    $(document).on('click', '.product-inform-availability', function() {
      if (!$(this).hasClass('disabled')) {
        var product_form = $(this).parents('form');
        var av_data = productAdder.collectData(product_form, -1);
        popupOpen('jslib', {
          method: 'addComingsoonProduct',
          data: av_data,
          id: 'availablity-inform-wrapper',
          build: function(popup, response) {
            popup.find('.content-wrapper').append(response.content);
            popup.find('form').validate({
              rules: {
                email: rules.email,
                is_accepted: rules.regulations,
              },
              messages: {
                email: messages.email,
                is_accepted: messages.regulations,
              },
              submitHandler: function(form) {
                var self = $(form);
                var input = self.find('input[type=submit]');
                input.blur();
                if (!input.hasClass('disabled')) {
                  LPP.common.openSpinner({
                    parentSelector: '#comingSoonFormSubmit',
                    keepContent: true,
                  });
                  Librarian.saveComingsoonProduct(self.serialize(), function(response, status) {
                    if (response) {
                      response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                      if (response.status === true) {
                        popupOpen('flash', { success: true, message: response.message });
                      } else {
                        popupOpen('flash', { success: false, message: response.message });
                      }
                    }
                    LPP.common.closeSpinner();
                  });
                }
              },
            });
          },
        });
      }
      return false;
    });

    // Main menu
    $('#mainMenu > li.dropdown > ul').each(function() {
      $(this)
        .addClass('drop-down-sub-menu')
        .wrap(
          '<div class="drop-down-container"><div class="shadow-container"><div class="sub-menu-container shadow-middle"></div></div></div>'
        )
        .parents('.drop-down-container')
        .prepend('<div class="hovered-main-menu-shadow"></div>')
        .children('.shadow-container')
        .prepend(
          '<div class="shadow-horizontal shadow-top"></div><div class="shadow-horizontal shadow-bottom"></div><div class="shadow-vertical shadow-left first"></div><div class="shadow-vertical shadow-right"></div><div class="shadow-corner shadow-right shadow-top"></div><div class="shadow-corner shadow-right shadow-bottom"></div><div class="shadow-corner shadow-left shadow-bottom"></div>'
        );
    });

    handleLastViewedProducts();
    // Getting json data about top menu product container in collection submenu
    Librarian.getProductList('list_name=global_menu', topMenuProducts);
  });

  // Appending data into product container in collection submenu - topmenu
  function topMenuProducts(data) {
    $('.drop-down-menu-products-container').append(data.content);
  }

  function slideThumbnails(container, isNext) {
    var $active = container.children('.active'),
      $activeNext = $active.next(),
      $activePrev = $active.prev();

    if (isNext && $activeNext.length) {
      $active.removeClass('top');
      $activeNext
        .addClass('top')
        .find('a')
        .click();
    } else if (!isNext && $activePrev.length) {
      $active.removeClass('top');
      $activePrev
        .addClass('top')
        .find('a')
        .click();
    }
  }

  function slideThumbnailsTo($container, $active, currentSlide) {
    var slideDuration = 300,
      photoMargin = 15,
      prevButtonHeight = 45,
      visiblePhotos = 3,
      totalSlides = $container.children().length,
      maxSlides = totalSlides - visiblePhotos,
      height = Math.ceil($active.find('img')[0].getBoundingClientRect().height) + photoMargin,
      sliderOffset = -(setAndValidateSlide(currentSlide, maxSlides, visiblePhotos) * height - prevButtonHeight);

    $container
      .children('.first')
      .stop()
      .animate(
        {
          'margin-top': sliderOffset + 'px',
        },
        slideDuration
      );
  }

  function setAndValidateSlide(currentSlide, maxSlides, visiblePhotos) {
    if (currentSlide <= visiblePhotos - 1) {
      return 0;
    } else if (currentSlide >= maxSlides) {
      return maxSlides;
    } else {
      return currentSlide;
    }
  }

  // Forms
  // Bytes counter - used in form validation
  function checkLength(string) {
    var escapedStr = encodeURI(string);
    if (escapedStr.search('%') >= 0) {
      var count = escapedStr.split('%').length - 1;
      if (count === 0) count++; //perverse case; can't happen with real UTF-8
      var tmp = escapedStr.length - count * 3;
      count = count + tmp;
    } else {
      count = escapedStr.length;
    }
    return count;
  }

  function checkEmailLength(string) {
    var email = string.split('@');
    return email[0].length <= 64 && email[1].length <= 255;
  }

  var errorPlacement = function(error, element) {
    if (element.attr('type') == 'radio') {
      error.insertAfter(element.closest('fieldset'));
    } else if (element.is('select')) {
      error.insertAfter(element.next('.select'));
    } else if (element.is('textarea')) {
      error.insertAfter(element.parents('.textarea-wrapper'));
    } else if (element.hasClass('input-text')) {
      error.insertAfter(element.parents('.input-text-wrapper'));
    } else if (element.attr('type') == 'checkbox' && element.hasAttr('id')) {
      var id = element.attr('id');
      if ($('label[for=' + id + ']').length) {
        error.insertAfter($('label[for=' + id + ']'));
      } else {
        error.insertAfter(element);
      }
    } else {
      error.insertAfter(element);
    }
  };
  var highlight = function(element, errorClass, validClass) {
    if ($(element).hasClass('input-text')) {
      if ($(element).is('textarea')) {
        var el = $(element).closest('.textarea-wrapper');
        el.addClass(errorClass).removeClass(validClass);
        if (!el.children('.error-icon').length) {
          el.append('<span class="error-icon"></span>');
        }
        if (el.children('.valid-icon').length) {
          el.children('.valid-icon').remove();
        }
      } else {
        var el = $(element).closest('.input-text-wrapper');
        el.addClass(errorClass).removeClass(validClass);
        if (!el.children('.error-icon').length) {
          el.append('<span class="error-icon"></span>');
        }
        if (el.children('.valid-icon').length) {
          el.children('.valid-icon').remove();
        }
      }
    } else if ($(element).is('select')) {
      var el = $(element).next('.select');
      el.addClass(errorClass).removeClass(validClass);
      if (!el.children('.error-icon').length) {
        el.append('<span class="error-icon"></span>');
      }
      if (el.children('.valid-icon').length) {
        el.children('.valid-icon').remove();
      }
    }
    $(element)
      .addClass(errorClass)
      .removeClass(validClass);
  };
  var unhighlight = function(element, errorClass, validClass) {
    if ($(element).hasClass('input-text')) {
      if ($(element).is('textarea')) {
        var el = $(element).closest('.textarea-wrapper');
        el.addClass(errorClass).removeClass(validClass);
        if (!el.children('.valid-icon').length) {
          el.append('<span class="valid-icon"></span>');
        }
        if (el.children('.error-icon').length) {
          el.children('.error-icon').remove();
        }
      } else {
        var el = $(element).closest('.input-text-wrapper');
        el.addClass(errorClass).removeClass(validClass);
        if (!el.children('.valid-icon').length) {
          el.append('<span class="valid-icon"></span>');
        }
        if (el.children('.error-icon').length) {
          el.children('.error-icon').remove();
        }
      }
    } else if ($(element).is('select')) {
      var el = $(element).next('.select');
      el.addClass(errorClass).removeClass(validClass);
      if (!el.children('.valid-icon').length) {
        el.append('<span class="valid-icon"></span>');
      }
      if (el.children('.error-icon').length) {
        el.children('.error-icon').remove();
      }
    }
    $(element)
      .removeClass(errorClass)
      .addClass(validClass);
  };
  var invalidHandler = function(form, validator) {
    if (!validator.numberOfInvalids()) {
      return;
    }
    var obj = $(validator.errorList[0].element);
    var plus = obj.is('.hidden') ? 10000 : 0;
    $('html, body').scrollTop(obj.offset().top - 120 + plus);
    if (!obj.is('.hidden')) {
      $(validator.errorList[0].element).focus();
    }
  };
  // Global scope
  window.invalidHandler = invalidHandler;
  $.validator.setDefaults({
    errorPlacement: errorPlacement,
    highlight: highlight,
    unhighlight: unhighlight,
  });

  $(document).ready(function() {
    function debug() {
      if (false) {
        console.log(arguments);
      }
    }

    /* contact lighbox form */

    var contactLinkTarget = jQuery('#contact-container');
    var resultBox = jQuery('#customer-notice-result');

    jQuery(document).on('click', 'a[data-target="#modal-customer-service"]', function() {
      var self = $(this);

      //hide and empty result box
      resultBox.hide();
      resultBox.html('');

      //open lightbox and on success define form validation handling
      popupOpen('html', {
        jqueryObject: contactLinkTarget,
        id: contactLinkTarget.attr('id') + '-wrapper',
        onload: function() {
          //transform form elements to fancy elements
          jQuery('#' + contactLinkTarget.attr('id') + '-wrapper .transformed').removeClass('transformed');

          // Enable styling for open `select`
          var $selectWrapper = jQuery('.select-set').find('select');

          if ($selectWrapper) {
            $selectWrapper.on('click', function() {
              $(this).toggleClass('open');
            });

            $(document).mouseup(function(event) {
              if (!$selectWrapper.is(event.target)) {
                $selectWrapper.removeClass('open');
              }
            });
          }

          if (LPP.common.recaptchaEnabled) {
            var $customerServiceLightboxForm = $('.popup-container #customerServiceLightboxForm'),
              $divCaptcha = $customerServiceLightboxForm.find('.captcha'),
              sitekey = $divCaptcha.data('captchkey'),
              html = '<div class="g-recaptcha input-set" id="gRecaptcha"></div>',
              script = '<script src="https://www.google.com/recaptcha/api.js"></script>';

            $divCaptcha.append(html);
            $customerServiceLightboxForm.append(script);
            $customerServiceLightboxForm.find('.g-recaptcha').attr('data-sitekey', sitekey);
          }

          (function handleSelects() {
            var $departmentSelect = $('#contactSubjectLightbox');
            $departmentSelect.change(function() {
              var $this = $(this),
                $form = $this.parents('form'),
                $currentTitle = $('.contact-title-' + $this.val(), $form);

              $('.contact-title', $form)
                .addClass('hidden')
                .find('select')
                .attr('name', '');

              if ($currentTitle.length) {
                $currentTitle.children('.select-set').removeClass('error valid');
                $currentTitle
                  .removeClass('hidden')
                  .find('select')
                  .attr('name', 'title');
              }
            });
          })();
        },
        success: function($popup, popupClose) {
          var $customerServiceLightboxForm = $('#customerServiceLightboxForm');
          $customerServiceLightboxForm.validate({
            ignore: [],
            rules: rules['contactFormModal'].rules,
            messages: rules['contactFormModal'].messages,
            errorPlacement: function(error, element) {
              element.parent().append(error);
            },
            highlight: function(element, errorClass, validClass) {
              $(element)
                .parent('div')
                .addClass(errorClass)
                .removeClass(validClass);
            },
            unhighlight: function(element, errorClass, validClass) {
              $(element)
                .parent('div')
                .addClass(validClass)
                .removeClass(errorClass);
            },
            onfocusout: function(element) {
              this.element(element);
            },
            submitHandler: function(form) {
              var self = $(form),
                button = self.find('#contactSend');
              button.blur();
              if (!button.hasClass('disabled')) {
                LPP.common.openSpinner({
                  parentSelector: '.popup-container .content-layer',
                  keepContent: true,
                  headerText: global.i18n.sending_contact_form,
                });
                Librarian.sendCustomerNotice(self.serialize(), function(response, status) {
                  if (status) {
                    if (response.status) {
                      popupClose();
                      popupOpen('flash', { message: response.content.message, success: true });
                    } else {
                      popupOpen('flash', { message: response.message, success: false });
                    }
                  } else {
                    popupOpen('flash', { message: global.i18n['general_error'], success: false });
                  }
                });
              }
              if (LPP.common.recaptchaEnabled) {
                grecaptcha.reset();
              }
              return false;
            },
          });

          var autocomplete = self.data('autocomplete');
          $(autocomplete).each(function() {
            $customerServiceLightboxForm.find('[name="' + this.name + '"]').val(this.value);
          });

          if (self.hasClass('contact-order-history') || self.hasClass('contact-cart')) {
            // on order history we are setting the depart - Sklep ONLINE
            var $contactSubjectLightbox = $('#contactSubjectLightbox');
            $contactSubjectLightbox.each(function() {
              $('option', this).each(function() {
                if (
                  $(this)
                    .text()
                    .toLowerCase()
                    .indexOf('sklep online') !== -1
                ) {
                  $contactSubjectLightbox.val($(this).val()).change();
                  $contactSubjectLightbox.parents('.input-field').addClass('hidden');
                  return false;
                }
              });
            });
          }
          setTimeout(function() {
            $customerServiceLightboxForm.removeClass('invisible');
          }, 1);
        },
      });

      return false;
    });

    var $checkoutStepSuccess = $('#checkoutStepSuccess');
    if ($checkoutStepSuccess.length) {
      Librarian.getProductList({ list_name: 'checkout_cart' }, function(data) {
        if (data.status) {
          var obj = $(data.content);
          obj.hide();
          $checkoutStepSuccess
            .parent()
            .parent()
            .append(obj);
          $('#cart-crosssell').fadeIn();
        }
      });
    }

    $(document).on('click', 'a[data-confirm]', function() {
      var $this = $(this);
      popupOpen('confirm', {
        isForm: true,
        message: global.i18n.confirm_cancel_order,
        url: $this.attr('href'),
        method: $this.data('method'),
        data: $this.data('data'),
      });
      return false;
    });

    $(document).on('click', '.global-action-print', function() {
      window.print();
      return false;
    });
    $(document).on('click', '.global-action-email', function() {
      popupOpen('html', {
        jqueryObject: $('#email-share-container'),
        id: 'email-share-wrapper',
        success: function() {
          if (typeof curr_product !== 'undefined') {
            $('#email-share-wrapper #share_product_id').val(curr_product);
          }
        },
      });
      $('#email-share-wrapper form').validate({
        rules: {
          email: {
            real_email: true,
          },
          friends_email: {
            real_emails: true,
          },
        },
        submitHandler: function(form) {
          var self = $(form);
          var input = self.find('input[type=submit]');
          input.blur();
          if (!input.hasClass('disabled')) {
            input
              .addClass('disabled')
              .prop('disabled', true)
              .next('.spinner')
              .removeClass('hidden');
            $.ajax({
              url: self.attr('action'),
              data: self.serialize(),
              method: 'POST',
              success: function(response) {
                if (response.status) {
                  popupClose();
                  popupOpen('flash', {
                    message: response.content.message,
                    success: true,
                  });
                } else {
                  popupOpen('flash', {
                    message: response.message,
                    success: false,
                  });
                }
              },
              complete: function() {
                input
                  .removeClass('disabled')
                  .prop('disabled', false)
                  .next('.spinner')
                  .addClass('hidden');
              },
            });
          }
        },
      });
      return false;
    });

    $('.message .shadow-middle > *').each(function() {
      var height = $(this).outerHeight(true);
      var parent_height = $(this)
        .parent()
        .height();
      var move = (parent_height - height) / 2;
      $(this).css({
        position: 'relative',
        top: move + 'px',
      });
    });

    // localstorage used on collection
    if (!($('body').is('#category') || $('body').is('#product-view'))) {
      localStorage.catalogpath = '';
      localStorage.offset = '';
      localStorage.listpage = '';
    }
    if (typeof global.i18n.popup_cookie_name !== 'undefined') {
      var cookie = jQuery.cookie(global.i18n.popup_cookie_name);
      var template = '' + '<div id="display_cookie_message">' + '{0}' + '<a class="close"></a></div>';
      if (!cookie || parseInt(cookie, 10) !== 1) {
        var popup = jQuery(template.format(global.i18n.popup_cookie_message)).prependTo('#header');
        if ($('.dismiss').length > 0) {
          $('.dismiss').remove();
        }
        if ($.browser.msie && $.browser.version === '8') {
          $('#display_cookie_message').css({
            background: '#000000',
          });
          $('#display_cookie_message .close').css({
            'background-position': '-410px -40px',
          });
        }
        popup.on('click', '.close', function(event) {
          event.preventDefault();
          jQuery.cookie(global.i18n.popup_cookie_name, 1, { path: '/', expires: 1460 });
          popup.remove();
        });
      }
    }

    var $selectWrapper = jQuery('.select-set').find('select');

    if ($selectWrapper) {
      $selectWrapper.on('click', function() {
        $(this).toggleClass('open');
      });

      $(document).mouseup(function(event) {
        if (!$selectWrapper.is(event.target)) {
          $selectWrapper.removeClass('open');
        }
      });
    }
  });
})(jQuery);

window.onscroll = function(oEvent) {
  if ('#header'.length) {
    $('#header').css('left', window.innerWidth < 1280 ? -window.pageXOffset : 0);
  }
  if ('#product-header'.length) {
    $('#product-header').css('left', window.innerWidth < 1280 ? -window.pageXOffset : 0);
  }
};
function categoriesInMobileMenu() {
  var OPEN_CLASS = 'open',
    SECTION_NAME_ATTR = 'id',
    MAIN_MENU_SELECTOR = '#mainMenu',
    mainMenu = document.querySelector(MAIN_MENU_SELECTOR);

  if (mainMenu) {
    mainMenu.querySelectorAll('li').forEach(function(element) {
      element.addEventListener('click', menuElementClickHandler);
    });
  }
  function menuElementClickHandler() {
    var elementClassList = this.classList;
    if (elementClassList.contains(OPEN_CLASS)) {
      elementClassList.remove(OPEN_CLASS);
    } else {
      closeAllCategory();
      elementClassList.add(OPEN_CLASS);
    }
  }

  function closeAllCategory() {
    mainMenu.querySelectorAll('li.open').forEach(function(element) {
      element.classList.remove(OPEN_CLASS);
    });
  }

  document.querySelectorAll(MAIN_MENU_SELECTOR + ' a').forEach(function(anchor) {
    anchor.addEventListener('click', saveAnchorCategory);
  });
  function saveAnchorCategory() {
    var LAST_CATEGORY_ATTR = 'data-last-category',
      section = findSectionNode(this),
      sectionName;
    if (!section) {
      document.cookie = 'lastSection=0; path=/;';
      return;
    }
    sectionName = section.getAttribute(SECTION_NAME_ATTR);
    document.cookie = 'lastSection=' + sectionName + '; path=/;';
    mainMenu.setAttribute(LAST_CATEGORY_ATTR, sectionName);
  }

  function findSectionNode(node) {
    if (node.id && node.id.indexOf('menuCategory_') !== -1) {
      return node;
    }
    if (node === document.body) {
      return null;
    }
    return findSectionNode(node.parentNode);
  }
}
function openLastMenuSection() {
  var mainMenu = document.getElementById('mainMenu'),
    lastSectionName = getCookieValueByName('lastSection'),
    lastSection;
  if (lastSectionName === '0' || !lastSectionName) {
    return;
  }
  lastSection = document.getElementById(lastSectionName);

  if (lastSection) {
    lastSection.classList.add('open');
  }
}
function getCookieValueByName(cookieName) {
  var cookies = document.cookie,
    cookiePosition = cookies.indexOf(cookieName),
    startPosition = cookiePosition + cookieName.length + 1,
    endPosition = cookies.indexOf(';', startPosition);
  if (cookiePosition === -1) {
    return;
  }
  if (endPosition !== -1) {
    return cookies.substring(startPosition, endPosition);
  }
  return cookies.substr(startPosition);
}

var listDaysAndMonths = {
  days: [
    global.i18n.sunday,
    global.i18n.monday,
    global.i18n.tuesday,
    global.i18n.wednesday,
    global.i18n.thursday,
    global.i18n.friday,
    global.i18n.saturday,
  ],
  months: [
    global.i18n.january,
    global.i18n.february,
    global.i18n.march,
    global.i18n.april,
    global.i18n.may,
    global.i18n.june,
    global.i18n.july,
    global.i18n.august,
    global.i18n.september,
    global.i18n.october,
    global.i18n.november,
    global.i18n.december,
  ],
};

var zDatePicker = {
  defaultValue: function() {
    var today = new Date(),
      dayName = today.getDate(),
      yesterday = today,
      yesterdayDayName = null,
      yesterdayMonthName = null,
      monthName = today.getMonth() + 1, //January is 0!
      fullYear = today.getFullYear(),
      pastDate = '01.01.' + (fullYear - 110),
      getDay = today.getDay(),
      dweek = getDay == 6 ? 1 : 0, //SA pickup for DI
      dweek = getDay == 5 ? 2 : dweek;

    yesterday.setDate(dayName - 1);
    yesterdayDayName = yesterday.getDate();
    yesterdayMonthName = yesterday.getMonth() + 1;

    if (yesterdayDayName < 10) {
      yesterdayDayName = '0' + yesterdayDayName;
    }

    if (yesterdayMonthName < 10) {
      yesterdayMonthName = '0' + yesterdayMonthName;
    }

    if (dayName < 10) {
      dayName = '0' + dayName;
    }

    if (monthName < 10) {
      monthName = '0' + monthName;
    }

    today = dayName + '.' + monthName + '.' + fullYear;
    yesterday = yesterdayDayName + '.' + yesterdayMonthName + '.' + yesterday.getFullYear();

    return {
      pastDate: pastDate,
      today: today,
      yesterday: yesterday,
      dweek: dweek,
    };
  },
  datePickerInit: function(element) {
    var $datepickerElement = jQuery(element);

    $datepickerElement.Zebra_DatePicker({
      format: 'd.m.Y',
      view: 'years',
      direction: [zDatePicker.defaultValue().pastDate, zDatePicker.defaultValue().yesterday],
      show_icon: false,
      start_date: zDatePicker.defaultValue().yesterday,
      show_select_today: false,
      show_clear_date: false,
      months: listDaysAndMonths.months,
      days: listDaysAndMonths.days,
    });
  },
};

jQuery(document).ready(function(e) {
  categoriesInMobileMenu();
  openLastMenuSection();

  zDatePicker.datePickerInit('#dateOfBirth');

  if (jQuery('#rmaReturnForm').length || jQuery('#rmaComplaintForm').length) {
    var $datepickerCourier = jQuery('#dateCheckCourier');
    $datepickerCourier.Zebra_DatePicker({
      format: 'd.m.Y',
      view: '',
      direction: [2 + zDatePicker.defaultValue().dweek, 30],
      show_icon: false,
      disabled_dates: ['* * * 0,6'],
      months: listDaysAndMonths.months,
      days: listDaysAndMonths.days,
      show_select_today: false,
      show_clear_date: false,
    });
  }

  if (jQuery('#rmaComplaintForm').length) {
    var today = new Date(),
      dayName = today.getDate(),
      monthName = today.getMonth() + 1, //January is 0!
      fullYear = today.getFullYear();

    if (dayName < 10) {
      dayName = '0' + dayName;
    }

    if (monthName < 10) {
      monthName = '0' + monthName;
    }

    (today = dayName + '.' + monthName + '.' + fullYear), (orderDate = $('.order-date').val());

    jQuery('.date-picker-complaint').each(function() {
      jQuery("input[class*='date-complaint']").Zebra_DatePicker({
        format: 'd.m.Y',
        view: 'years',
        direction: [orderDate, today],
        show_icon: false,
        start_date: today,
        show_select_today: false,
        show_clear_date: false,
        months: listDaysAndMonths.months,
        days: listDaysAndMonths.days,
      });
    });
  }

  var $html = jQuery('html'),
    $mainMenu = jQuery('#mainMenu'),
    $mobileMenuOverlay = jQuery('#mobileMenuOverlay'),
    $closeButton = jQuery('#closeButton');

  jQuery('#mobileMenuTrigger').click(function openMenu() {
    $mainMenu.addClass('opened');
    disableScrolling();
    $mobileMenuOverlay.on('click', closeMenu);
    $closeButton.on('click', closeMenu);

    function closeMenu() {
      $mobileMenuOverlay.off('click', closeMenu);
      $mainMenu.removeClass('opened');
      enableScrolling();
    }

    function disableScrolling() {
      $mobileMenuOverlay.on('touchmove', function(e) {
        e.preventDefault();
      });
      $html.css('overflow', 'hidden');
    }

    function enableScrolling() {
      $mobileMenuOverlay.off('touchmove');
      $html.css('overflow', 'scroll');
    }
  });
});

(function($) {
  $(document).ready(function() {
    if ($('body').is('#login') || $('body').is('#remind')) {
      $("form[data-form='password-recovery'] fieldset").data(
        'original_content',
        $("form[data-form='password-recovery'] fieldset").html()
      );

      $('.login-link').click(function() {
        var root = $('#container > #content > .content');
        var target = $($(this).data('target'));
        setLoginPane(root, target);
        return false;
      });

      $('#extendSwitch').change(function() {
        var el = $(this);
        var t = el.parents('fieldset').find('.extend-fields');
        if (el.prop('checked')) {
          t.show();
          $("input[name='location[firstname]']").val($("input[name='firstname']").val());
          $("input[name='location[lastname]']").val($("input[name='lastname']").val());
        } else {
          t.hide();
        }
      });

      var $loginHeading = $('.login').find('h2');

      if ($loginHeading.height() > parseInt($loginHeading.css('line-height'))) {
        $loginHeading.css('margin-top', 0);
      }
    }
  });
})(jQuery);

if (!window.setLoginPane) {
  window.setLoginPane = function(root, target) {
    var $this = $(this),
      targetId = target[0].id,
      eventName = '';
    root.addClass('hidden');
    target.removeClass('hidden');
    target.find('.show-on-load').removeClass('hidden');
    target.find('*').each(function() {
      if ($this.data('original_content')) {
        $this.html($this.data('original_content'));
      }
    });
    $('body').attr('id', target.data('body'));
    $(window).scrollTop(0);

    if (targetId.indexOf('login') >= 0) {
      eventName = 'userLoginPageViewEvent';
    } else if (targetId.indexOf('register') >= 0) {
      eventName = 'userRegisterPageViewEvent';
    }

    if (!eventName) {
      return;
    }

    LegacyBridge.addCustomEventToDataLayer(eventName, {
      type: 'old',
      referrer: LegacyBridge.loginPageReferrer(),
    });
  };
}

(function ($) {
  $(document).ready(function () {
    // Add validation for customer data form

    if ($('body').is('#customer')) {
      function menuHandler(hash) {
        if (hash === '' || hash === '#') {
          var cookie_hash = jQuery.cookie(window.hashCookieName);
          if (typeof cookie_hash !== 'undefined') {
            hash = cookie_hash;
            window.hashCookieName = hash;
            jQuery.cookie(window.hashCookieName, null, { path: '/' });
          } else {
            return;
          }
        }

        var mapperArray = {
          '#personal-data': '#customer-data',
          '#shipping-data': '#customer-shipping-data',
          '#billing-data': '#customer-invoices',
        };

        var form = mapperArray[hash];

        if (form === undefined) {
          form = '#customer-data';
        }

        // menu
        var $customerBoxesMenuLink = $('#customerBoxesMenu > li' + form + '-link');
        if ($customerBoxesMenuLink.length) {
          $('#customerBoxesMenu > li.active').removeClass('active');
          $customerBoxesMenuLink.addClass('active');
        }

        //title
        $('#customer-title-bar > h2.active').removeClass('active').addClass('hidden');
        $(form + '-title')
          .removeClass('hidden')
          .addClass('active');

        //form
        $('#customer-wrapper > .active').removeClass('active').addClass('hidden');
        $(form).removeClass('hidden').addClass('active');

        var contact_box = $('#customer-data-info').clone();
        $('#customer-data-info').remove();
        $(form).children('.customer-form').after(contact_box);
        $(window).scrollTop(0).data('currentHash', hash);

        if (sinsayValidation.billingAdressGeoValidation) {
          sinsayValidation.billingAdressGeoValidation.closeError();
        }

        if (form === '#customer-invoices') {
          sinsayValidation.billingAddress();
        }
      }

      function changeAddress() {
        var addressSelector = document.getElementById('customerShippingAddressSelect'),
          removeButton = document.getElementById('removeButton'),
          removeHref = removeButton.href,
          removeButtonContainer = removeButton.parentElement,
          addressFormContainer = document.getElementById('addressInputsContainer'),
          addressIdInput = document.getElementById('addressId'),
          firstnameInput = document.getElementById('addressFirstname'),
          lastnameInput = document.getElementById('addressLastname'),
          streetInput = document.getElementById('addressStreetName'),
          buildingNumberInput = document.getElementById('addressBuildingNumber'),
          apartmentNumberInput = document.getElementById('addressApartmentNumber'),
          cityInput = document.getElementById('addressCity'),
          postcodeInput = document.getElementById('addressPostcode'),
          additionalInformationInput = document.getElementById('addressAdditionalInformation'),
          phoneInput = document.getElementById('addressPhone'),
          regionInput = document.getElementById('addressRegion'),
          data,
          id;

        if (!addressSelector) {
          return;
        }

        data = getCustomerShippingAddress(addressSelector.children[addressSelector.selectedIndex].value);

        id = data.id || '0';

        addressFormContainer.setAttribute('data-id', id);
        addressIdInput.value = id;
        removeButton.href = removeHref.replace(/id\/\d*\//, 'id/' + id + '/');
        if (id === '0') {
          removeButtonContainer.classList.add('hidden');
        } else {
          removeButtonContainer.classList.remove('hidden');
        }
        firstnameInput.value = data.firstname || '';
        lastnameInput.value = data.lastname || '';
        streetInput.value = data.street1 || '';
        cityInput.value = data.city || '';
        postcodeInput.value = data.postcode || '';
        additionalInformationInput.value = data.additionalInformation || '';
        phoneInput.value = data.phone || '';
        if (regionInput) {
          regionInput.value = data.region || '';
        }

        if (buildingNumberInput) {
          buildingNumberInput.value = data.street2 || '';
        }

        if (apartmentNumberInput) {
          apartmentNumberInput.value = data.street3 || '';
        }
      }

      function askConfirm() {
        if (needToConfirm) {
          return '';
        }
      }

      // Customer menu handler
      if ($('#customerBoxesMenu').length) {
        $(window).hashchange(function () {
          menuHandler(location.hash);
        });

        // Trigger the event (useful on page load).
        //$(window).hashchange();
        menuHandler(location.hash);
      }
      // Showing the assigned address
      changeAddress();

      // Showing the assigned address on select change
      $('#customerShippingAddressSelect').change(function () {
        changeAddress();
      });

      // Just show form
      $(
        '#customer-invoices-form-invoice-wrapper ul, #customer-invoices-form-company, #customer-invoices-form-invoice-data-wrapper'
      ).show();

      function handleInvoicesRadios(invoices_radio) {
        if (invoices_radio.is('#customer-invoices-form-billing-invoice-1')) {
          $('#customer-invoices-form-data-private').hide();
          $('#customer-invoices-form-company').show();
        } else {
          $('#customer-invoices-form-company').hide();
          $('#customer-invoices-form-data-private').show();
        }
      }

      var invoices_radio = $('#customer-invoices-form-invoice-wrapper input[type=radio]:checked');

      $('#customer-invoices-form-invoice-wrapper input[type=radio]').change(function () {
        handleInvoicesRadios($(this));
        sinsayValidation.billingAddress();
      });

      handleInvoicesRadios(invoices_radio);

      // Activating onbeforeunload when field values have changed
      needToConfirm = false;
      window.onbeforeunload = askConfirm;

      $('select, input, textarea').change(function () {
        needToConfirm = true;
      });

      $('#customer-shipping-data-form .help').click(function () {
        return false;
      });
    }

    function toggleEventsHandler() {
      var that = this,
        initialized = false;

      that.togglingElements = [];

      that.findTogglingElements = function () {
        that.togglingElements = [];

        jQuery('[data-toggle]').each(function () {
          var $this = jQuery(this),
            $toggledElements = $this.data('toggle');

          if (jQuery($toggledElements).length === 0) {
            return false;
          }

          that.togglingElements.push($this);

          if ($this.is('input[type="checkbox"]') || $this.is('input[type="radio"]')) {
            $this.unbind('change.toggleElements').bind('change.toggleElements', function () {
              if (this.checked) {
                that.toggleElementsVisibility($toggledElements, 'show', $this.data('display'));
              } else {
                that.toggleElementsVisibility($toggledElements, 'hide', $this.data('display'));
              }
            });
          } else {
            $this.unbind('click.toggleElements').bind('click.toggleElements', function () {
              that.toggleElementsVisibility($toggledElements, false, $this.data('display'));

              return false;
            });
          }
        });
      };

      that.toggleElementsVisibility = function ($elements, action, display) {
        var show = true,
          displayType = display || 'block';

        if (typeof action !== 'undefined' && action !== false) {
          if (action === 'hide') {
            show = false;
          }
        }

        if ($elements instanceof Array) {
          jQuery.each($elements, function () {
            var $this = jQuery(this);

            if (typeof action === 'undefined') {
              show = !that.isElementVisible($this);
            }

            if (show) {
              that.hideConnectedElements(this);
              $this.fadeIn(100).css('display', displayType);
            } else {
              that.showConnectedElements(this);
              $this.fadeOut(100);
            }
          });
        } else {
          if (typeof action === 'undefined') {
            show = !that.isElementVisible($elements);
          }

          if (show) {
            that.hideConnectedElements($elements);
            jQuery($elements).css('display', displayType).fadeIn(100);
          } else {
            that.showConnectedElements($elements);
            jQuery($elements).fadeOut(100);
          }
        }
      };

      that.isElementVisible = function ($element) {
        return jQuery($element).is(':visible');
      };

      that.hideConnectedElements = function (dataToggleElement) {
        jQuery('[data-toggle*="' + dataToggleElement + '"][data-hide]').hide();
      };

      that.showConnectedElements = function (dataToggleElement) {
        jQuery('[data-toggle*="' + dataToggleElement + '"][data-hide]').show();
      };

      that.init = function () {
        that.findTogglingElements();
        initialized = true;
      };

      if (!initialized) {
        that.init();
      }

      return that;
    }

    toggleEventsHandler();

    var changePaymentToCodButtons = document.querySelectorAll('.change-payment-to-cod-button');

    changePaymentToCodButtons.forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        popupOpen('confirm', {
          isForm: false,
          message: global.i18n.are_you_sure_to_want_to_change_payment_method,
          confirmAction: function () {
            window.location = button.dataset.url;
          },
        });
      });
    });
  });
})(jQuery);

if (!window.saveHashCookie) {
  window.hashCookieName = 'SUBMITTED_ACCOUNT_HASH';
  window.saveHashCookie = function () {
    jQuery.cookie(window.hashCookieName, $(window).data('currentHash'), { path: '/' });
  };
}

if (!window.selectReturnForm) {
  window.selectReturnForm = function () {
    var $pickupType = $('#pickup-type'),
      $pickupWrapper = $('.pickup-wrapper');
    $pickupType.on('change', '.form-control', function () {
      var $this = $(this),
        optionValue = $this.find('option:selected').val(),
        $methodInput = $('.rma-form-wrapper').find('input[name="method"]');
      $pickupWrapper.hide();
      switch (optionValue) {
        case 'allow_store':
          $('.pickup-type-store').show();
          $methodInput.val('store');
          break;
        case 'allow_courier':
          $('.pickup-type-courier').show();
          $methodInput.val('self');
          break;
        case 'allow_free':
          $('.pickup-type-courier-free').show();
          $methodInput.val('courier');
          break;
        case 'allow_russian_post':
          $('.pickup-type-courier').show();
          $methodInput.val('russian_post');
          break;
        case 'allow_post':
          $('.pickup-type-courier').show();
          $methodInput.val('post');
          break;
      }
    });
  };
}

function acceptRulesAjax($form) {
  // TODO: do uporządkowania po wdrożeniu rodo
  var data = $form.serialize(),
    acceptRulesPopup;
  data += '&terms_accepted=true';
  Librarian.authorization(data, function (response) {
    var acceptRulesPopup;
    if (response) {
      response = typeof response === 'object' ? response : jQuery.parseJSON(response);
      if (response.status === true) {
        if (typeof response.content !== 'undefined' && typeof response.content.url !== 'undefined') {
          document.location.href = response.content.url;
        } else {
          window.location.reload();
        }
      } else {
        LPP.common.closeSpinner();
        acceptRulesPopup = document.getElementById('acceptRulesPopup');
        acceptRulesPopup.style.display = 'none';
        popupOpen('flash', { message: response.message, success: false });
      }
    }
  });
}

var grid = {
  filters: {
    colors: [],
    sizes: [],
    features: [],
  },
  filtersIds: {
    colors: [],
    sizes: [],
    features: [],
  },
  filtersInfo: {
    colors: [],
    sizes: [],
    features: [],
  },
  badges: [],
  colors: {},
  priceMin: null,
  priceMax: null,
  jsonProcessed: false,
  collectionFull: [],
  collectionModelsToIds: {},
  collectionIdsToModels: {},
  collectionIdsToIndexes: {},
  collectionFiltered: [],
  store: null,
};

var min_product_height = 350;

var product_image_duration = 300;
function handleProductImagesHovers(products) {
  products.each(function() {
    var product = $(this);
    product.find('.product-colors > a.active').each(function() {
      product.data('img-front', $(this).data('img-front'));
      product.data('img-back', $(this).data('img-back'));
    });
  });
  products
    .find('.product-image > a')
    .mouseenter(function() {
      var $this = $(this);
      if ($(this).data('timer')) {
        clearTimeout($(this).data('timer'));
      }
      $('#temp-image').attr(
        'src',
        $(this)
          .parents('.product')
          .data('img-back')
      );
      $(this).data(
        'timer',
        setTimeout(function() {
          $this.css('background-image', 'url("' + $this.parents('.product').data('img-back') + '")');
        }, 100)
      );
    })
    .mouseleave(function() {
      if ($(this).data('timer')) {
        clearTimeout($(this).data('timer'));
      }
      $(this).css(
        'background-image',
        'url("' +
          $(this)
            .parents('.product')
            .data('img-front') +
          '")'
      );
    });
  products.find('.product-colors > a').mouseenter(function() {
    var product = $(this).parents('.product');
    var image = product.find('.product-image > a');
    if (product.data('img-front') != $(this).data('img-front')) {
      product.data('img-front', $(this).data('img-front'));
      product.data('img-back', $(this).data('img-back'));
      $(this)
        .parent()
        .children('.active')
        .removeClass('active');
      $(this).addClass('active');
      if (image.data('timer')) {
        clearTimeout(image.data('timer'));
      }
      $('#temp-image').attr('src', product.data('img-front'));
      image.data(
        'timer',
        setTimeout(function() {
          image.css('background-image', 'url("' + product.data('img-front') + '")');
        }, 50)
      );
    }
  });
}

function getViewportHeight() {
  var height = window.innerHeight; // Safari, Opera
  var mode = document.compatMode;

  if (mode || !$.support.boxModel) {
    // IE, Gecko
    height =
      mode == 'CSS1Compat'
        ? document.documentElement.clientHeight // Standards
        : document.body.clientHeight; // Quirks
  }

  return height;
}

function canGoToCarouselPage(is_next) {
  var page = parseInt($('#products-carousel').data('page'));
  if (!is_next && page == 1) {
    return false;
  }
  var new_page = page + (is_next ? 1 : -1);
  return $('#products-carousel .products-section:eq(' + (new_page - 1) + '):not(.hidden)').length == 1;
}

function handleStorageValues(filterValues) {
  var price_from = 0;
  var price_to = 0;
  $('#products-grid').addClass('hidden');
  $.each(filterValues, function(i, field) {
    switch (field.name) {
      case 'size':
        setTimeout(function() {
          $('label[for="products-filter-size-option-' + field.value + '"]').click();
        }, 10);
        break;
      case 'color':
        setTimeout(function() {
          $('label[for="products-filter-color-option-' + field.value + '"]').click();
        }, 10);
        break;
      case 'feature':
        setTimeout(function() {
          $('label[for="products-filter-feature-option-' + field.value + '"]').click();
        }, 10);
        break;
      case 'price_from':
        price_from = field.value;
        break;
      case 'price_to':
        price_to = field.value;
        break;
      case 'order':
        setTimeout(function() {
          $("label[data-value='" + field.value + "']").click();
        }, 10);
        break;
    }
    if (price_from > 0 && price_to > 0) {
      $('#products-filters .ui-slider-horizontal').each(function() {
        $(this).slider('values', [price_from, price_to]);
      });
    }
  });
  setTimeout(function() {
    $('#products-grid').removeClass('hidden');
  }, 100);
}

(function($) {
  $(document).ready(function() {
    if ($('body').is('#category') || $('body').is('#search')) {
      var click = false;
      $('.products-collection').on('click', '.product-colors > a', function() {
        return false;
      });

      $('#products-grid').on('click', '.product-image > a', function() {
        var offset = $(this).offset();
        click = true;
        localStorage.offset = JSON.stringify(offset);
      });

      if (typeof is_carousel === 'undefined') {
        $('#product-header > div.shadow').addClass('hidden');
      } else {
        if (is_carousel) {
          var carousel_duration = 1000;
          $('#products-carousel > a').click(function() {
            var is_start = $(this).is('.start');
            var is_next = $(this).is('.next');
            var old_page = parseInt($('#products-carousel').data('page'));
            var page = is_start ? 1 : old_page + (is_next ? 1 : -1);
            var margin = -(page - 1) * grid.containerWidth;
            if (page == grid.productsSectionCount) {
              var products_in_last_section_count =
                grid.collectionFiltered.length - (grid.productsSectionCount - 1) * grid.productsSectionSize;
              margin += Math.ceil((grid.productsSectionSize - products_in_last_section_count) * grid.productBoxWidth);
            }
            $('#products-carousel > .products-section:first')
              .stop()
              .animate({ 'margin-left': margin + 'px' }, is_start ? 0 : carousel_duration);
            $('#products-carousel').data('page', page);
            if (!canGoToCarouselPage(true)) {
              $('#products-carousel > a.next').hide();
              if (page > 1) {
                $('#products-carousel > a.start').show();
              }
            } else {
              $('#products-carousel > a.next').show();
              $('#products-carousel > a.start').hide();
            }
            if (!canGoToCarouselPage(false)) {
              $('#products-carousel > a.prev').hide();
            } else {
              $('#products-carousel > a.prev').show();
            }
            return false;
          });
          $(this).keyup(function(e) {
            if (e.keyCode == KEYCODE_ARROW_LEFT) {
              if (canGoToCarouselPage(false)) {
                $('#products-carousel > a.prev').trigger('click');
              }
            } else if (e.keyCode == KEYCODE_ARROW_RIGHT) {
              if (canGoToCarouselPage(true)) {
                $('#products-carousel > a.next').trigger('click');
              }
            }
          });
          $('#products-carousel').mousewheel(function(event, delta) {
            if ($(this).data('timerMouseWheel')) {
              clearTimeout($(this).data('timerMouseWheel'));
            }
            $(this).data(
              'timerMouseWheel',
              setTimeout(function() {
                if (delta > 0) {
                  if (canGoToCarouselPage(false)) {
                    $('#products-carousel > a.prev').trigger('click');
                  }
                } else if (delta < 0) {
                  if (canGoToCarouselPage(true)) {
                    $('#products-carousel > a.next').trigger('click');
                  }
                }
              }, 200)
            );
          });
        }

        // Scalling small images

        $('.products-collection .product-image a').css('background-size', 'cover');
        $(window).resize(function() {
          if (!is_carousel) {
            $(window).scroll();
          } else {
            if ($('#products-carousel').data('page') > 1) {
              $('#products-carousel').data('page', 1);
              $('#products-carousel > a').hide();
              if (canGoToCarouselPage(true)) {
                $('#products-carousel > a.next')
                  .show()
                  .css('opacity', 1);
              } else {
                $('#products-carousel > a.next').hide();
              }
              $('#products-carousel > .products-section:first').css('margin-left', 0);
            }
          }
        });

        // Small images hovers and colors

        handleProductImagesHovers($('#products-grid .product'));
      }

      if ($('#search-empty').length) {
        Librarian.getProductList({ list_name: 'catalog_product_view' }, function(data) {
          if (data.status) {
            var obj = $(data.content);
            obj.hide();
            $('#search-upsell').append(obj);
            $('#search-upsell > *').fadeIn();
          }
        });
      }

      $(window).unload(function() {
        var catalogFilterVal = $('#products-filters').serializeArray();
        localStorage.catalogpath = window.location.pathname;
        localStorage.catalogfilterval = JSON.stringify(catalogFilterVal);
        if (!click) {
          localStorage.offset = '';
          localStorage.listpage = '';
        }
      });

      $('#product-header').click(function() {
        localStorage.offset = '';
        localStorage.listpage = '';
      });
    }
  });
})(jQuery);

(function($) {
  $(document).ready(function() {
    if ($('body').is('#new-password')) {
      $('#new-password .new-password form').validate({
        rules: {
          confirmation: {
            equalTo: '#password',
          },
        },
      });
    }
  });
})(jQuery);

$(document).ready(function($) {
  $('#cms-page-find-order').click(function() {
    popupOpen('html', {
      jqueryObject: $('#find-order'),
      id: 'find-order-wrapper',
      initialHeight: 317,
      success: function() {
        $('#find-order-wrapper')
          .find('form')
          .validate({
            rules: rules['searchOrderCms'].rules,
            messages: rules['searchOrderCms'].messages,
            focusInvalid: false,
            submitHandler: function(form) {
              var self = $(form);
              var input = self.find('input[type=submit]');
              input.blur();
              if (!input.hasClass('disabled')) {
                LPP.common.openSpinner({
                  parentSelector: '#find-order-wrapper',
                  keepContent: true,
                });
                Librarian.searchOrder(self.serialize(), function(response, status) {
                  if (response) {
                    response = typeof response === 'object' ? response : jQuery.parseJSON(response);
                    if (response.status === true) {
                      document.location.href = response.content.url;
                    } else {
                      popupOpen('flash', { message: response.message, success: false });
                    }
                  }
                });
              }
            },
          });
      },
    });
    return false;
  });
});

// eslint-disable-next-line no-unused-vars
var ABLastItemInfo = function() {
  var TEST_CLASS = 'AB-last-item-info',
    productInfo = document.querySelector('.product-info'),
    productAvailabilityButton = document.querySelector('.product-availability'),
    productColors = document.querySelector('.product-colors.colors-wrapper'),
    colors = productColors.querySelectorAll('a'),
    size = productInfo.querySelectorAll('.size'),
    lastItemInfo = document.createElement('div');
  lastItemInfo.id = 'lastItemInfo';
  lastItemInfo.className = 'last-item-info';
  lastItemInfo.innerHTML = '<p>&nbsp;</p>';

  function displayLastItemsInfo(productId) {
    var xhr = new XMLHttpRequest();
    lastItemInfo.classList.remove('fade-in');
    xhr.responseType = 'json';
    xhr.open('GET', global.path.baseUrl + 'ajx/product/getstock/product/' + productId, true);
    xhr.onreadystatechange = function() {
      var OK = 200;
      if (xhr.readyState == xhr.DONE && xhr.status == OK && xhr.response) {
        if (xhr.response.qty === 1) {
          lastItemInfo.innerHTML = '<p class="last-item">' + global.i18n.last_item_info + '</p>';
          lastItemInfo.classList.add('fade-in');
        } else if (xhr.response.qty > 1 && xhr.response.qty < 4) {
          lastItemInfo.innerHTML = '<p class="last-items">' + global.i18n.last_items_info + '</p>';

          lastItemInfo.classList.add('fade-in');
        } else {
          lastItemInfo.innerHTML = '<p>&nbsp;</p>';
        }
      }
    };
    xhr.send(null);
  }

  function addListenerOnSizeClick(sizeElement) {
    sizeElement.addEventListener('click', function() {
      displayLastItemsInfo(this.getAttribute('data-product-id'));
    });
  }

  document.body.classList.add(TEST_CLASS);
  productAvailabilityButton.parentNode.insertBefore(lastItemInfo, productAvailabilityButton.nextSibling);

  size.forEach(function(sizeElement) {
    addListenerOnSizeClick(sizeElement);
  });

  colors.forEach(function(colorElement) {
    colorElement.addEventListener('click', function() {
      setTimeout(function() {
        document.querySelectorAll('.product-info .size').forEach(function(sizeElement) {
          addListenerOnSizeClick(sizeElement);
          if (sizeElement.className.indexOf('active') > -1) {
            sizeElement.click();
          }
        });
      }, 200);
    });
  });
};

// This script contains methods that should be executed as the last ones.

jQuery(window).on('load', function() {
  jQuery(window).trigger('resize'); // Trigger all functions assigned to Resize event
});

// RUN FUNCTIONS AFTER DOM IS READY
window.addEventListener('DOMContentLoaded', function () {
  handleAccordions();
});

// RUN FUNCTIONS AFTER PAGE LOAD
window.onload = function () {
  cmsPagesDropdown();
  searchBar();
  initPostcodeAutocomplete();
};

if (global.vkontakte.isEnabled) {
  window.addEventListener('DOMContentLoaded', function() {
    var vkLoginButton = document.getElementById('vkontakteLoginButton');

    if (vkLoginButton) {
      vkLoginButton.addEventListener('click', function(event) {
        event.preventDefault();
        window.open(
          'https://oauth.vk.com/authorize?client_id=' +
            global.vkontakte.appId +
            '&display=popup&redirect_uri=' +
            global.vkontakte.redirectUrl +
            '&scope=email&response_type=code&v=5.67',
          'VKontakte login popup',
          'height=200,width=350'
        );
      });
    }
  });
}

var baseRequest = {
    apiVersion: 2,
    apiVersionMinor: 0,
  },
  cardPaymentMethod = {
    type: 'CARD',
    parameters: {
      allowedAuthMethods: LPP.common.payments.googlepay.allowedCardAuthMethods,
      allowedCardNetworks: LPP.common.payments.googlepay.allowedCardNetworks,
    },
    tokenizationSpecification: {
      type: 'PAYMENT_GATEWAY',
      parameters: {
        gateway: 'payu',
        gatewayMerchantId: LPP.common.payments.googlepay.posId,
      },
    },
  },
  paymentsClient = null;

function getGooglePaymentDataRequest() {
  var paymentDataRequest = Object.assign({}, baseRequest);
  paymentDataRequest.allowedPaymentMethods = [cardPaymentMethod];
  paymentDataRequest.transactionInfo = {};
  paymentDataRequest.merchantInfo = {
    merchantId: LPP.common.payments.googlepay.merchantId,
    merchantName: LPP.common.payments.googlepay.merchantName,
  };
  return paymentDataRequest;
}

function getGooglePaymentsClient() {
  if (paymentsClient === null) {
    paymentsClient = new google.payments.api.PaymentsClient({ environment: LPP.common.payments.googlepay.environment });
  }
  return paymentsClient;
}

function getGoogleTransactionInfo() {
  return LPP.common.payments.googlepay.getPriceFromQuote().then(function(response) {
    return {
      countryCode: LegacyBridge.getStoreConfig('general/country/code').toUpperCase(),
      currencyCode: response.currencyCode,
      totalPriceStatus: 'FINAL',
      totalPrice: response.totalPrice,
    };
  });
}

LPP.common.payments.googlepay.sendRequest = function(options) {
  options.beforeRequestCallback && options.beforeRequestCallback();

  var paymentDataRequest = getGooglePaymentDataRequest();

  getGoogleTransactionInfo()
    .then(function(response) {
      paymentDataRequest.transactionInfo = response;
      return paymentDataRequest;
    })
    .then(function(paymentDataRequest) {
      getGooglePaymentsClient()
        .loadPaymentData(paymentDataRequest)
        .then(function(paymentData) {
          LPP.common.payments.googlepay.submitCheckoutAsAjax(
            paymentData.paymentMethodData.tokenizationData.token,
            options.form
          );
        })
        .catch(function() {
          options.afterRequestCallback && options.afterRequestCallback();
        });
    });
};

LPP.common.payments.googlepay.submitCheckoutAsAjax = function(token, form) {
  var data = jQuery(form).serializeArray();
  data.push({ name: 'token', value: token });

  var fetch = new Promise(function(resolve, reject) {
    jQuery
      .ajax({
        url: LPP.common.checkout.order.submit,
        data: jQuery.param(data),
        method: 'POST',
      })
      .done(function(response) {
        resolve(response);
      })
      .fail(function(error) {
        reject(error);
      });
  });

  return fetch
    .then(function(response) {
      window.location.href = response.url;
    })
    .catch(function(err) {
      window.location.href = LPP.common.checkout.order.error;
    });
};

LPP.common.payments.googlepay.getPriceFromQuote = function() {
  return fetch(LPP.common.baseUrl + 'checkout/order/summary', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
    .then(function(response) {
      return response.json();
    })
    .then(function(response) {
      return {
        totalPrice: response.totalPrice,
        currencyCode: response.currencyCode,
      };
    })
    .catch(function() {
      window.location = LPP.common.checkout.order.error;
    });
};

LPP.common.payments.googlepay.isPaymentChecked = function(selector) {
  var element = document.querySelector(selector);

  if (!element) {
    return false;
  }
  return element.checked;
};

if (window.jQuery) {
  jQuery('document').ready(function() {
    setTimeout(function() {
      if (jQuery.cookie && !jQuery.cookie('_ga')) {
        jQuery.ajax({ url: window.global.url.regenerateAnalyticsCookie });
      }
    }, 2000);
  });
}

var lppShared = lppShared || {};

lppShared.newsletter = {
  cookieName: 'newsletterCookie=',
  setCookie: function(value) {
    var day = new Date(),
      expires = 'expires=';

    day.setTime(day.getTime() + 30 * 24 * 60 * 60 * 1000);
    expires += day.toUTCString();

    document.cookie = this.cookieName + value + '; ' + expires + '; path=/';
  },
  getCookieValue: function() {
    var cookies = document.cookie.split(';'),
      cookiesNumber = cookies.length,
      i,
      cookie;

    for (i = 0; i < cookiesNumber; i++) {
      cookie = cookies[i].trim();

      if (cookie.indexOf(this.cookieName) == 0) {
        return cookie.substring(this.cookieName.length);
      }
    }
    return '';
  },
  checkCookie: function(force) {
    var currentCookieValue = this.getCookieValue(),
      $popup;
    if (/newsletter|subscri|checkout/.exec(document.location.href)) {
      return false;
    }
    var isLogged = LPP.isLogged || undefined,
      isSubscribed = LPP.isSubscribed || undefined;
    if (isLogged && isSubscribed) {
      this.setCookie(3);
      return;
    }

    if (currentCookieValue === '' && !force) {
      this.setCookie(1);
    } else if (parseInt(currentCookieValue) === 1 && !force) {
      this.setCookie(parseInt(++currentCookieValue));
    } else if (parseInt(currentCookieValue) === 2 || force) {
      $popup = jQuery('.newsletter-popup');
      $popup.show();

      this.bindPopupActions($popup);
      this.completeSubscriptionPlace($popup);
      this.gtmNewsletterPopupShown();

      if (!force) {
        this.setCookie(3);
      }
    }
  },
  gtmNewsletterPopupShown: function() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'newsletter', action: 'view', label: 'popup' });
  },
  completeSubscriptionPlace: function($popup) {
    var placeInput = $popup.find('.ai-subscription-place');
    if (placeInput.length) {
      placeInput.val('popup');
    }
  },
  bindPopupActions: function($popup) {
    var cmsBlock = jQuery('.popup-cms-block-nl'),
      closePopup = function() {
        $popup.hide();
      };

    $popup.find('.close').click(function() {
      closePopup();
    });

    $popup.click(function(event) {
      if (event.target == this) {
        closePopup();
      }
    });

    cmsBlock.click(function(event) {
      if (event.target == this) {
        closePopup();
      }
    });
  },
};

/**
 * Created by mkasperski on 2015-04-15.
 */

window.isBankAccountNumberValid = false;

var bankAccountNumberValidation = {
  getBankName: function (accountNo) {
    var bankNames = [];
    (bankNames[101] = 'Narodowy Bank Polski'),
      (bankNames[102] = 'Powszechna Kasa Oszczędności Bank Polski SA'),
      (bankNames[103] = 'Bank Handlowy w Warszawie SA'),
      (bankNames[105] = 'ING Bank Śląski SA'),
      (bankNames[106] = 'Bank BPH SA'),
      (bankNames[109] = 'Bank Zachodni WBK SA'),
      (bankNames[113] = 'Bank Gospodarstwa Krajowego'),
      (bankNames[114] = 'mBank SA'),
      (bankNames[116] = 'Bank Millennium SA'),
      (bankNames[122] = 'Bank Handlowo - Kredytowy SA'),
      (bankNames[124] = 'Bank Polska Kasa Opieki SA'),
      (bankNames[128] = 'HSBC Bank Polska SA'),
      (bankNames[130] = 'Meritum Bank ICB SA'),
      (bankNames[132] = 'Bank Pocztowy SA'),
      (bankNames[144] = 'NORDEA BANK POLSKA SA'),
      (bankNames[146] = 'Getin Noble Bank S.A.'),
      (bankNames[147] = 'Euro Bank SA'),
      (bankNames[154] = 'Bank Ochrony Środowiska SA'),
      (bankNames[156] = 'Getin Noble Bank S.A. '),
      (bankNames[158] = 'Mercedes-Benz Bank Polska SA'),
      (bankNames[160] = 'BNP PARIBAS BANK POLSKA SA'),
      (bankNames[161] = 'SGB-Bank SA'),
      (bankNames[167] = 'RBS Bank (Polska) SA'),
      (bankNames[168] = 'PLUS BANK SA'),
      (bankNames[171] = 'Bank BPH S.A.'),
      (bankNames[174] = 'DZ BANK Polska SA'),
      (bankNames[175] = 'Raiffeisen Bank Polska SA'),
      (bankNames[184] = 'Societe Generale SA '),
      (bankNames[187] = 'FM Bank PBP SA'),
      (bankNames[188] = 'Deutsche Bank Polska SA'),
      (bankNames[189] = 'Pekao Bank Hipoteczny SA'),
      (bankNames[191] = 'Deutsche Bank PBC SA'),
      (bankNames[193] = 'BANK POLSKIEJ SPÓŁDZIELCZOŚCI SA'),
      (bankNames[194] = 'Credit Agricole Bank Polska SA'),
      (bankNames[195] = 'Idea Bank SA'),
      (bankNames[200] = 'Rabobank Polska SA'),
      (bankNames[203] = 'Bank Gospodarki Żywnościowej SA'),
      (bankNames[207] = 'FCE Bank Polska SA'),
      (bankNames[212] = 'Santander Consumer Bank SA'),
      (bankNames[213] = 'VOLKSWAGEN BANK POLSKA SA'),
      (bankNames[214] = 'Fiat Bank Polska SA'),
      (bankNames[215] = 'mBank Hipoteczny SA'),
      (bankNames[216] = 'Toyota Bank Polska SA'),
      (bankNames[219] = 'DNB Bank Polska SA'),
      (bankNames[221] = 'Bank of Tokyo-Mitsubishi UFJ SA'),
      (bankNames[224] = 'Banque PSA Finance SA'),
      (bankNames[225] = 'Svenska Handelsbanken AB SA'),
      (bankNames[227] = 'Sygma Banque Societe Anonyme SA'),
      (bankNames[229] = 'BPI Bank Polskich Inwestycji SA'),
      (bankNames[230] = 'The Royal Bank of Scotland N.V. SA'),
      (bankNames[232] = 'Nykredit Realkredit A/S SA'),
      (bankNames[235] = 'BNP PARIBAS SA'),
      (bankNames[236] = 'Danske Bank A/S SA'),
      (bankNames[237] = 'Skandinaviska Enskilda Banken AB'),
      (bankNames[238] = 'Banco Mais S.A.'),
      (bankNames[239] = 'CAIXABANK, S.A.'),
      (bankNames[241] = 'Elavon Financial Services Limited'),
      (bankNames[243] = 'BNP Paribas Securities Services SKA '),
      (bankNames[245] = 'HSBC Bank plc S.A.'),
      (bankNames[247] = 'Banco Espirito Santo de Investimento'),
      (bankNames[248] = 'Getin Noble Bank SA'),
      (bankNames[249] = 'Alior Bank SA'),
      (bankNames[251] = 'Aareal Bank Aktiengesellschaft'),
      (bankNames[252] = 'CREDIT SUISSE (LUXEMBOURG) S.A.'),
      (bankNames[254] = 'Citibank Europe plc'),
      (bankNames[255] = 'Ikano Bank GmbH'),
      (bankNames[256] = 'Nordea Bank AB SA'),
      (bankNames[257] = 'UBS Limited'),
      (bankNames[258] = 'J.P. Morgan Europe Limited Sp. z o.o. '),
      (bankNames[259] = 'ZUNO BANK AG SA'),
      (bankNames[260] = 'Bank of China (Luxembourg) S.A.'),
      (bankNames[261] = 'Vanquis Bank Limited'),
      (bankNames[262] = 'Industrial and Commercial Bank of China (Europe)'),
      (bankNames[263] = 'Saxo Bank A/S'),
      (bankNames[264] = 'RCI Banque Spółka Akcyjna'),
      (bankNames[265] = 'EUROCLEAR Bank SA/NV'),
      (bankNames[266] = 'Intesa Sanpaolo S.p.A.'),
      (bankNames[267] = 'Western Union International Bank GmbH'),
      (bankNames[268] = 'DZ BANK AG Deutsche Zentral-Genossenschaftsbank');
    accountNo = accountNo.substring(2, 5);
    if (bankNames[accountNo]) {
      return bankNames[accountNo];
    }
    if (accountNo >= 800) {
      return 'Bank spóldzielczy';
    }
    return '';
  },

  NRBvalidatior: function (nrb) {
    nrb = nrb.replace(/[^0-9]+/g, '');
    var weights = [
      1, 10, 3, 30, 9, 90, 27, 76, 81, 34, 49, 5, 50, 15, 53, 45, 62, 38, 89, 17, 73, 51, 25, 56, 75, 71, 31, 19, 93, 57
    ];
    if (nrb.length == 26) {
      nrb += 2521;
      nrb = nrb.substr(2) + nrb.substr(0, 2);
      var Z = 0;
      for (var i = 0; i < 30; i++) {
        Z += nrb[29 - i] * weights[i];
      }
      return Z % 97 == 1 ? true : false;
    } else {
      return false;
    }
  },

  polishBankAccountCheck: function (saveFromMail) {
    var _self = this;
    jQuery('.bank-nr').on('input', function () {
      var accountNo = jQuery(this)
          .val()
          .replace(/[^0-9]+/g, ''),
        bankNameElement = jQuery('#bankName'),
        value = accountNo,
        $this = jQuery(this);
      if (value.length == 0 && !saveFromMail) {
        bankNameElement.hide();
        window.isBankAccountNumberValid = false;
        $this.removeClass('error').addClass('valid');
      } else if (value.length > 2) {
        bankNameElement.show();
        value =
          value.substring(0, 2) +
          ' ' +
          value
            .substring(2, value.length)
            .match(/.{1,4}/g)
            .join(' ');
        jQuery(this).val(value);

        if (_self.NRBvalidatior(accountNo)) {
          bankNameElement.html(_self.getBankName(accountNo));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          window.isBankAccountNumberValid = false;
          if (accountNo.length < 26) {
            bankNameElement.html(window.langTxt.invalidFormat);
          } else {
            bankNameElement.html(window.langTxt.enterValid);
          }
          $this.removeClass('valid').addClass('error');
        }
      }
    });
  },

  czechAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        jQuery(this).val(jQuery(this).val().replace(/\s/g, ''));
        var $this = jQuery(this),
          accountNumber = jQuery(this).val(),
          isValid = _self.validateAccountNumber(accountNumber),
          infoElement = jQuery('#bankName');

        if (isValid.status) {
          infoElement.show().text(_self.bankCodeNames(isValid.paymentSystemCode));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },
    validateAccountNumber: function (accountNumber) {
      if (accountNumber.match(/[0-9]{0,6}-{0,1}[0-9]{2,10}\/[0-9]{4}/g)) {
        var paymentSystemCode = accountNumber.split('/')[1],
          clientAccountIdentifier = accountNumber.split('/')[0];

        if (paymentSystemCode.length > 4) {
          return {
            status: false
          };
        }

        if (clientAccountIdentifier.search('-') === -1) {
          // no '-' in account number
          if (this.checkNumber(clientAccountIdentifier)) {
            return {
              status: true,
              paymentSystemCode: paymentSystemCode
            };
          } else {
            return {
              status: false
            };
          }
        } else {
          // number with '-'
          var clientAccountIdentifierParts = clientAccountIdentifier.split('-');
          if (this.checkNumber(clientAccountIdentifierParts[0]) && this.checkNumber(clientAccountIdentifierParts[1])) {
            return {
              status: true,
              paymentSystemCode: paymentSystemCode
            };
          } else {
            return {
              status: false
            };
          }
        }
      } else {
        return {
          status: false
        };
      }
    },
    checkNumber: function (number) {
      var numberAsString = number.toString(),
        weights = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6],
        stringLength = numberAsString.length,
        numbersSum = 0;

      for (var i = 1; i <= stringLength; i++) {
        var num = numberAsString[stringLength - i];
        numbersSum += parseInt(num) * weights[i - 1];
      }

      if (numbersSum % 11 == 0) {
        return true;
      } else {
        return false;
      }
    },

    bankCodeNames: function (bankCode) {
      var bankNames = [];

      (bankNames['0100'] = 'Komerční banka, a.s.'),
        (bankNames['0300'] = 'Československá obchodní banka, a.s.'),
        (bankNames['0600'] = 'GE Money Bank, a.s.'),
        (bankNames['0700'] = 'Czech National Bank'),
        (bankNames['0800'] = 'Česká spořitelna, a.s.'),
        (bankNames['2010'] = 'Fio, družstevní záložna'),
        (bankNames['2020'] = 'Bank of Tokyo-Mitsubishi UFJ (Holland) N.V. Prague Branch, organizační složka'),
        (bankNames['2030'] = 'AKCENTA, spořitelní a úvěrní družstvo'),
        (bankNames['2040'] = 'UNIBON – spořitelní a úvěrní družstvo'),
        (bankNames['2050'] = 'WPB Capital, spořitelní družstvo'),
        (bankNames['2060'] = 'Prague Credit Union, spořitelní družstvo'),
        (bankNames['2070'] = 'Moravský Peněžní Ústav – spořitelní družstvo'),
        (bankNames['2100'] = 'Hypoteční banka, a.s.'),
        (bankNames['2200'] = 'Peněžmí dům, spořitelní družstvo'),
        (bankNames['2210'] = 'Banka mezinárodní spolupráce, a.s.'),
        (bankNames['2400'] = 'Raiffeisenbank a.s.'),
        (bankNames['2600'] = 'Citibank Europe plc, organizační složka'),
        (bankNames['2700'] = 'UniCredit Bank Czech Republic, a.s.'),
        (bankNames['3500'] = 'ING Bank N.V.'),
        (bankNames['4000'] = 'LBBW Bank CZ a.s.'),
        (bankNames['4300'] = 'Českomoravská záruční a rozvojová banka, a.s.'),
        (bankNames['5000'] = 'CALYON S.A. organizační složka'),
        (bankNames['5400'] = 'ABN AMRO Bank N.V.'),
        (bankNames['5500'] = 'Raiffeisenbank a.s.'),
        (bankNames['5800'] = 'J & T Banka, a.s.'),
        (bankNames['6000'] = 'PPF banka a.s.'),
        (bankNames['6100'] = 'Banco Popolare Česká republika, a.s.'),
        (bankNames['6200'] = 'COMMERZBANK AG, pobočka Praha'),
        (bankNames['6210'] = 'BRE Bank S.A., organizační složka podniku'),
        (bankNames['6300'] = 'Fortis Bank SA/NV, pobočka ČR'),
        (bankNames['6700'] = 'Všeobecná úverová banka, a.s., pobočka Praha'),
        (bankNames['6800'] = 'Volksbank CZ, a.s.'),
        (bankNames['7910'] = 'Deutsche Bank AG Filiale Prag'),
        (bankNames['7940'] = 'Waldviertler Sparkasse von 1842'),
        (bankNames['7950'] = 'Raiffeisen stavební spořitelna a.s.'),
        (bankNames['7960'] = 'Českomoravská stavební spořitelna a.s.'),
        (bankNames['7970'] = 'Wüstenrot-stavební spořitelna a.s.'),
        (bankNames['7980'] = 'Wüstenrot hypoteční banka, a.s. se sídlem v Praze'),
        (bankNames['7990'] = 'Modrá pyramida stavební spořitelna, a.s.'),
        (bankNames['8030'] = 'Raiffeisenbank im Stiftland eG pobočka Cheb, odštěpný závod'),
        (bankNames['8040'] = 'Oberbank AG pobočka Česká republika'),
        (bankNames['8060'] = 'Stavební spořitelna České spořitelny'),
        (bankNames['8070'] = 'Raiffeisen, a.s.'),
        (bankNames['8090'] = 'Česká exportní banka, a.s.'),
        (bankNames['8150'] = 'HSBC Bank plc - pobočka Praha'),
        (bankNames['8200'] = 'PRIVAT BANK AG der Raiffeisenlandesbank Oberösterreich'),
        (bankNames['8210'] = 'STRB Straumur-Burdaras Investment Bank hf - organizační složka');

      if (bankNames[bankCode]) {
        return bankNames[bankCode];
      } else {
        return '';
      }
    }
  },

  slovakiaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        jQuery(this).val(jQuery(this).val().replace(/\s/g, ''));
        var $this = jQuery(this),
          accountNumber = jQuery(this).val(),
          isValid = _self.validateAccountNumber(accountNumber),
          infoElement = jQuery('#bankName');

        if (isValid.status && isValid.iban === undefined) {
          infoElement.show().text(_self.bankCodeNames(isValid.paymentSystemCode));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else if (isValid.status && isValid.iban) {
          infoElement.show().text(_self.bankCodeNames(accountNumber.substr(4, 4)));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/SK[0-9]{22}/g);

      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        bankAccountVerified = false;
        return {
          status: false
        };
      }
    },

    checkNumber: function (number) {
      var numberAsString = number.toString(),
        weights = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6],
        stringLength = numberAsString.length,
        numbersSum = 0;

      for (var i = 1; i <= stringLength; i++) {
        var num = numberAsString[stringLength - i];
        numbersSum += parseInt(num) * weights[i - 1];
      }

      if (numbersSum % 11 == 0) {
        return true;
      } else {
        return false;
      }
    },

    bankCodeNames: function (bankCode) {
      var bankNames = [];

      (bankNames['0200'] = 'Všeobecná úverová banka, a.s.'),
        (bankNames['0900'] = 'Slovenská sporiteľňa, a.s.'),
        (bankNames['0720'] = 'Národná banka Slovenska'),
        (bankNames['1100'] = 'Tatra banka, a.s.'),
        (bankNames['1111'] = 'UniCredit Bank Czech Republic and Slovakia, a.s.'),
        (bankNames['3000'] = 'Slovenská záručná a rozvojová banka, a.s.'),
        (bankNames['3100'] = 'Sberbank Slovensko, a.s.'),
        (bankNames['5200'] = 'OTP Banka Slovensko, a.s.'),
        (bankNames['5600'] = 'Prima banka Slovensko, a.s.'),
        (bankNames['5900'] = 'Prvá stavebná sporiteľňa, a.s.'),
        (bankNames['6500'] = 'Poštová banka, a.s.'),
        (bankNames['7300'] = 'ING Bank N.V.,  pobočka zahraničnej banky'),
        (bankNames['7500'] = 'Československá obchodná banka, a.s.'),
        (bankNames['7930'] = 'Wstenrot stavebná sporiteľňa, a.s.'),
        (bankNames['8050'] = 'Commerzbank Aktiengesellschaft'),
        (bankNames['8100'] = 'Komerční banka, a.s.'),
        (bankNames['8120'] = 'Privatbanka, a.s.'),
        (bankNames['8130'] = 'Citibank Europe plc'),
        (bankNames['8170'] = 'ČSOB stavebná sporiteľňa, a.s.'),
        (bankNames['8160'] = 'EXIMBANKA SR'),
        (bankNames['8180'] = 'Štátna pokladnica'),
        (bankNames['8191'] = 'Centrálny depozitár cenných papierov SR, a.s.'),
        (bankNames['8400'] = 'Banco Banif Mais S.A.'),
        (bankNames['8320'] = 'J&T BANKA, a.s.'),
        (bankNames['8330'] = 'Fio banka, a.s.'),
        (bankNames['8360'] = 'mBank S.A.'),
        (bankNames['8370'] = 'Oberbank AG  pobočka zahraničnej banky v Slovenskej republike'),
        (bankNames['8390'] = 'AKCENTA, spořitelní a uvěrní družstvo, pobočka Košice'),
        (bankNames['8410'] = 'ZUNO BANK AG'),
        (bankNames['8420'] = 'BKS Bank AG v SR'),
        (bankNames['8430'] = 'KDB Bank Europe Ltd.'),
        (bankNames['9950'] = 'First Data Slovakia, s.r.o.'),
        (bankNames['9951'] = 'Burza cenných papierov v Bratislave, a.s.'),
        (bankNames['9952'] = 'Trust Pay, a.s.'),
        (bankNames['2010'] = 'Fio banka, a.s.');

      if (bankNames[bankCode]) {
        return bankNames[bankCode];
      } else {
        return '';
      }
    }
  },

  romaniaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = $this.val().replace(/\s/g, ''),
          isValid = _self.validateAccountNumber(accountNumber),
          infoElement = jQuery('#bankName'),
          isValidAccountNumber = new RegExp(LegacyBridge.getStoreConfig('rma/bankAccountValidation')).test(
            accountNumber
          );

        $this.val(accountNumber);

        if (isValid.status && isValid.iban === undefined && isValidAccountNumber) {
          infoElement.show().text(_self.bankCodeNames(isValid.paymentSystemCode));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else if (isValid.status && isValid.iban && isValidAccountNumber) {
          infoElement.show().text(_self.bankCodeNames(accountNumber.substr(4, 4)));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      if (IBAN.isValid(accountNumber)) {
        return {
          status: true,
          iban: true
        };
      } else {
        return {
          status: false
        };
      }
    },

    bankCodeNames: function (bankCode) {
      var bankNames = [];

      (bankNames['BUCU'] = 'ALPHA BANK ROMANIA S.A.'),
        (bankNames['WBAN'] = 'BANCA COMERCIALA INTESA SANPAOLO ROMANIA S.A.'),
        (bankNames['MILB'] = 'BANCA MILLENNIUM S.A.'),
        (bankNames['MIND'] = 'BANCA ROMANA DE CREDITE SI INVESTITII SA'),
        (bankNames['BTRL'] = 'BANCA TRANSILVANIA S.A.'),
        (bankNames['DAFB'] = 'BANK LEUMI ROMANIA S.A.'),
        (bankNames['BCRL'] = 'BCR BANCA PENTRU LOCUINTE S.A.'),
        (bankNames['BLOM'] = 'BLOM BANK FRANCE S.A. PARIS - ROMANIAN BRANCH'),
        (bankNames['FTSB'] = 'BNP Paribas Fortis SA/NV Bruxelles Sucursala Bucuresti'),
        (bankNames['BRDE'] = 'BRD - Groupe Societe Generale S.A.'),
        (bankNames['CRCO'] = 'Banca Centrala Cooperatista CREDITCOOP'),
        (bankNames['CARP'] = 'Banca Comerciala CARPATICA S.A.'),
        (bankNames['BFER'] = 'Banca Comerciala FEROVIARA S.A.'),
        (bankNames['RNCB'] = 'Banca Comerciala Romana S.A.'),
        (bankNames['BRMA'] = 'Banca Romaneasca S.A. Membra a Grupului National Bank of Greece'),
        (bankNames['EXIM'] = 'Banca de Export Import a Romaniei EXIMBANK S.A.'),
        (bankNames['BPOS'] = 'Bancpost S.A.'),
        (bankNames['BCYP'] = 'Bank of Cyprus Public Company Limited Nicosia - Romanian Branch'),
        (bankNames['CECE'] = 'C.E.C BANK. S.A.'),
        (bankNames['BSEA'] = 'CREDIT AGRICOLE BANK ROMANIA S.A.'),
        (bankNames['CITI'] = 'Citibank Europe plc, Dublin - Sucursala Romania'),
        (bankNames['FNNB'] = 'Credit Europe Bank (Romania) S.A.'),
        (bankNames['UGBI'] = 'GARANTI BANK S.A.'),
        (bankNames['INGB'] = 'ING Bank N.V., Amsterdam - Bucharest Branch'),
        (bankNames['BREL'] = 'LIBRA INTERNET BANK S.A.'),
        (bankNames['EGNA'] = 'MARFIN BANK (ROMANIA) S.A.'),
        (bankNames['FNCC'] = 'MKB ROMEXTERRA Bank S.A.'),
        (bankNames['NBOR'] = 'National Bank of Romania'),
        (bankNames['OTPV'] = 'OTP BANK ROMANIA S.A.'),
        (bankNames['PIRB'] = 'PIRAEUS BANK ROMANIA S.A.'),
        (bankNames['PORL'] = 'Porsche Bank Romania S.A.'),
        (bankNames['MIRO'] = 'ProCredit Bank S.A'),
        (bankNames['RZBR'] = 'RAIFFEISEN BANK SA'),
        (bankNames['ROIN'] = 'ROMANIAN INTERNATIONAL BANK S.A.'),
        (bankNames['RZBL'] = 'Raiffeisen Banca pentru Locuinte S.A.'),
        (bankNames['TBIB'] = 'TBI Bank EAD Sofia - Sucursala Bucuresti'),
        (bankNames['ABNA'] = 'THE ROYAL BANK OF SCOTLAND PLC, EDINBURGH, - SUCURSALA ROMANIA'),
        (bankNames['BACX'] = 'UniCredit Bank S.A.'),
        (bankNames['VBBU'] = 'VOLKSBANK ROMANIA S.A.'),
        (bankNames['BITR'] = 'Veneto Banca Scpa Italia Montebelluna Sucursala Bucuresti');

      if (bankNames[bankCode]) {
        return bankNames[bankCode];
      } else {
        return '';
      }
    }
  },

  hungaryAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = jQuery(this).val().replace(/\s$/, ''),
          isValid,
          infoElement = jQuery('#bankName');

        accountNumber = accountNumber.replace(/\s/g, '');

        jQuery(this).val(accountNumber);
        isValid = _self.validateAccountNumber(accountNumber);

        if (isValid.status && isValid.iban === undefined) {
          infoElement.show().text(_self.bankCodeNames(accountNumber.substr(0, 8)));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else if (isValid.status && isValid.iban) {
          infoElement.show().text(_self.bankCodeNames(accountNumber.substr(2, 8)));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^HU[0-9]{26}$/im);
      if (isIban) {
        return {
          status: true,
          iban: true
        };
      } else {
        if (!this.checkNumber(accountNumber)) {
          return {
            status: false
          };
        }
        return {
          status: true
        };
      }
    },

    checkNumber: function (number) {
      if (!number.match(/^\d{8}-\d{8}(:?-\d{8})?$/m)) {
        return false;
      }
      return true;
    },

    bankCodeNames: function (bankCode) {
      var bankNames = [];
      (bankNames['80800004'] = 'Széchenyi I. Hsz., Zalaegerszegi'),
        (bankNames['80700021'] = 'Általános Közlekedési Hitelszöv'),
        (bankNames['10900011'] = 'UniCredit Bank Hungary Zrt.'),
        (bankNames['80700014'] = 'Általános Közlekedési Hitelszövetke'),
        (bankNames['80600017'] = 'Szentesi Hitelszövetkezet'),
        (bankNames['12010611'] = 'Raiffeisen Bank Zrt.'),
        (bankNames['80500010'] = 'Magyar Vidék Hitelszövetkezet'),
        (bankNames['63200030'] = 'Pannon Takarék Bank Zrt.'),
        (bankNames['80301000'] = 'Tiszántúli Első Hitelszöv'),
        (bankNames['12026609'] = 'Raiffeisen Bank Zrt.'),
        (bankNames['60700081'] = 'Főnix Takarékszövetkezet'),
        (bankNames['10900011'] = 'UniCredit Bank Hungary Zrt.'),
        (bankNames['50100019'] = 'Bóly és Vidéke Takarékszövetkezet'),
        (bankNames['50088885'] = 'TAKARÉKBANK'),
        (bankNames['19017004'] = 'Magyar Nemzeti Bank'),
        (bankNames['18800001'] = 'Széchenyi Kereskedelmi Bank Zrt.'),
        (bankNames['10300002'] = 'MKB Bank Zrt.'),
        (bankNames['18400010'] = 'OBERBANK Ag'),
        (bankNames['18100002'] = 'FHB Bank'),
        (bankNames['17810007'] = 'BNP-Paribas'),
        (bankNames['63200016'] = 'Pannon Takarék Bank Zrt.'),
        (bankNames['10102615'] = 'Budapest Bank Zrt.'),
        (bankNames['11600006'] = 'Erste Bank Zrt.'),
        (bankNames['10401914'] = 'K&H Bank Zrt.'),
        (bankNames['11773432'] = 'OTP Somogy'),
        (bankNames['11773346'] = 'OTP Borsod'),
        (bankNames['11773449'] = 'OTP Szabolcs'),
        (bankNames['12001008'] = 'Raiffeisen Bank Zrt.'),
        (bankNames['10401165'] = 'K&H Bank Zrt.'),
        (bankNames['64400068'] = 'Alsónémedi és Vidéke Takarékszövetkezet'),
        (bankNames['53200125'] = 'Endrőd és Vidéke Takarékszövetkezet'),
        (bankNames['10101195'] = 'Budapest Bank Nyrt'),
        (bankNames['10033001'] = 'Magyar Államkincstár'),
        (bankNames['10100792'] = 'Budapest Bank Nyrt'),
        (bankNames['10404247'] = 'K&H Bank Zrt.'),
        (bankNames['11773418'] = 'OTP Nógrád'),
        (bankNames['11773425'] = 'OTP Pest'),
        (bankNames['10410008'] = 'K&H Bank Zrt.'),
        (bankNames['10400346'] = 'K&H Bank Zrt.'),
        (bankNames['10700024'] = 'CIB Bank'),
        (bankNames['14100275'] = 'Volksbank Zrt.'),
        (bankNames['70600126'] = 'Dunaföldvár és Vidéke Takarékszöve'),
        (bankNames['10404900'] = 'K&H Bank Zrt.'),
        (bankNames['14100000'] = 'Volksbank Zrt.'),
        (bankNames['12094507'] = 'Raiffeisen Bank Zrt.'),
        (bankNames['10700093'] = 'CIB Bank Zrt.'),
        (bankNames['11991119'] = 'Erste Bank'),
        (bankNames['50800142'] = 'Szigetvári Takarékszövetkezet'),
        (bankNames['10102103'] = 'Budapest Bank Zrt.'),
        (bankNames['11748007'] = 'OTP Észak '),
        (bankNames['10700172'] = 'CIB Bank Zrt.'),
        (bankNames['11773047'] = 'OTP IV.kerületi'),
        (bankNames['10404089'] = 'K&H Bank Zrt.'),
        (bankNames['11609005'] = 'Erste Bank Zrt.'),
        (bankNames['17600248'] = 'Sopron Bank Zrt.'),
        (bankNames['17600011'] = 'Sopron Bank Zrt.'),
        (bankNames['17500014'] = 'Bank of China (Hungária) Zrt.'),
        (bankNames['17400000'] = 'Commerzbank Zrt.'),
        (bankNames['17200051'] = 'Credigen Bank Zrt.'),
        (bankNames['17200068'] = 'Credigen Bank Zrt.'),
        (bankNames['10402142'] = 'K&H Bank Zrt.');

      if (bankNames[bankCode]) {
        return bankNames[bankCode];
      } else {
        return '';
      }
    }
  },

  lithuaniaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = jQuery(this).val().replace(/\s/g, ''),
          isValid = _self.validateAccountNumber(accountNumber),
          infoElement = jQuery('#bankName');

        $this.val($this.val().replace(/[^a-zA-Z0-9]/g, ''));

        if (isValid.status && isValid.iban) {
          infoElement.hide();
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^LT\d{18}$/im);
      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        if (!this.checkNumber(accountNumber)) {
          return {
            status: false
          };
        }
        return {
          status: true
        };
      }
    },

    checkNumber: function (number) {
      if (!number.match(/^LT\d{18}$/im)) {
        return false;
      }
      return true;
    }
  },

  latviaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('input.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = $this.val().replace(/\s/g, ''),
          isValid = _self.validateAccountNumber(accountNumber),
          $infoElement = jQuery('#bankName');

        $infoElement.hide();
        $this.val($this.val().replace(/[^a-zA-Z0-9]/g, ''));

        if (isValid.status && isValid.iban) {
          $infoElement.hide();
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          $infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^LV\d{2}[a-zA-Z]{4}\d{6}(A|\d){1}\d{6}$/im);
      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        if (!this.checkNumber(accountNumber)) {
          return {
            status: false
          };
        }
        return {
          status: true
        };
      }
    },

    checkNumber: function (number) {
      if (!number.match(/^LV\d{2}[a-zA-Z]{4}\d{6}(A|\d){1}\d{6}$/im)) {
        return false;
      }
      return true;
    }
  },

  estoniaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = jQuery(this).val().replace(/\s/g, ''),
          isValid = _self.validateAccountNumber(accountNumber),
          infoElement = jQuery('#bankName');

        $this.val($this.val().replace(/[^a-zA-Z0-9]/g, ''));

        if (isValid.status && isValid.iban) {
          infoElement.hide();
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^EE\d{18}$/im);
      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        if (!this.checkNumber(accountNumber)) {
          return {
            status: false
          };
        }
        return {
          status: true
        };
      }
    },

    checkNumber: function (number) {
      if (!number.match(/^EE\d{18}$/im)) {
        return false;
      }
      return true;
    }
  },

  russiaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this,
        rmaBankBikNumber = document.getElementById('rmaBankBikNumber'),
        rmaBank = document.getElementById('rmaBank');

      if (!rmaBankBikNumber || !rmaBank) {
        return;
      }

      rmaBankBikNumber.addEventListener('input', _self.checkNumber.bind(null, rmaBankBikNumber, rmaBank));
      rmaBank.addEventListener('input', _self.checkNumber.bind(null, rmaBankBikNumber, rmaBank));
    },

    checkNumber: function (bikField, accountNumberField) {
      var bik = bikField.value,
        bikNumberCheck = bik.match(/^\d{9}$/im),
        accountNumber = accountNumberField.value,
        accNumberCheck = accountNumber.match(/^[A-Z\d]{20}$/im),
        isValid = bankAccountNumberValidation.russiaAccountNumber.validateAccountNumber(bik, accountNumber);

      if (!accNumberCheck || !bikNumberCheck) {
        isValid = false;
      }

      window.isBankAccountNumberValid = isValid;

      bikField.dispatchEvent(new CustomEvent('blur'));
      accountNumberField.dispatchEvent(new CustomEvent('blur'));
    },

    validateAccountNumber: function (bik, accountNumber) {
      return LPP.common.rma.validateRussianAccountNumber.init({
        accountNumberId: accountNumber,
        bikId: bik
      });
    }
  },

  croatiaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = jQuery(this).val().replace(/\s$/, ''),
          isValid,
          infoElement = jQuery('#bankName');

        accountNumber = accountNumber.replace(/\s/g, '');

        jQuery(this).val(accountNumber);
        isValid = _self.validateAccountNumber(accountNumber);

        if (isValid.status && isValid.iban) {
          infoElement.show().text(_self.bankCodeNames(accountNumber.substr(4, 7)));
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.invalidFormat);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^HR\d{19}$/im);

      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        return {
          status: false
        };
      }
    },

    bankCodeNames: function (bankCode) {
      var bankNames = [];

      (bankNames['2500009'] = 'ADDIKO BANK d.d. Zagreb'),
        (bankNames['2481000'] = 'AGRAM BANKA d.d. Zagreb'),
        (bankNames['4133006'] = 'BANKA KOVANICA d.d. Varaždin'),
        (bankNames['2488001'] = 'BKS BANK AG, Glavna podružnica Hrvatska'),
        (bankNames['2485003'] = 'CROATIA BANKA d.d. Zagreb'),
        (bankNames['2402006'] = 'ERSTE & STEIERMÄRKISCHE BANK d.d. Rijeka'),
        (bankNames['2493003'] = 'HRVATSKA BANKA ZA OBNOVU I RAZVITAK Zagreb'),
        (bankNames['1001005'] = 'HRVATSKA NARODNA BANKA'),
        (bankNames['2390001'] = 'HRVATSKA POŠTANSKA BANKA d.d. Zagreb'),
        (bankNames['2492008'] = 'IMEX BANKA d.d. Split'),
        (bankNames['2380006'] = 'ISTARSKA KREDITNA BANKA  UMAG d.d. Umag'),
        (bankNames['2411006'] = 'JADRANSKA BANKA d.d. Šibenik'),
        (bankNames['2489004'] = 'J&T banka d.d. Varaždin'),
        (bankNames['2400008'] = 'KARLOVAČKA BANKA d.d. Karlovac'),
        (bankNames['4124003'] = 'KENTBANK d.d. Zagreb'),
        (bankNames['2407000'] = 'OTP BANKA HRVATSKA d.d. Split'),
        (bankNames['2408002'] = 'PARTNER BANKA d.d. Zagreb'),
        (bankNames['2386002'] = 'PODRAVSKA BANKA d.d. Koprivnica'),
        (bankNames['2340009'] = 'PRIVREDNA BANKA ZAGREB d.d. Zagreb'),
        (bankNames['2484008'] = 'RAIFFEISENBANK AUSTRIA d.d. Zagreb'),
        (bankNames['2403009'] = 'SAMOBORSKA BANKA d.d. Samobor'),
        (bankNames['2503007'] = 'SBERBANK d.d. Zagreb'),
        (bankNames['2412009'] = 'SLATINSKA BANKA d.d. Slatina'),
        (bankNames['2360000'] = 'ZAGREBAČKA BANKA d.d. Zagreb');

      if (bankNames[bankCode]) {
        return bankNames[bankCode];
      } else {
        return '';
      }
    }
  },

  ukraineAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = $this.val().replace(/\s$/, ''),
          isValid,
          infoElement = jQuery('#bankName');

        accountNumber = accountNumber.replace(/\s/g, '');

        $this.val(accountNumber);
        isValid = _self.validateAccountNumber(accountNumber);

        if (isValid.status && isValid.iban) {
          infoElement.hide();
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.invalidFormat);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^UA\d{27}$/im);

      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        return {
          status: false
        };
      }
    }
  },

  sloveniaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = $this.val().replace(/\s$/, ''),
          isValid,
          infoElement = jQuery('#bankName');

        accountNumber = accountNumber.replace(/\s/g, '');

        $this.val(accountNumber);
        isValid = _self.validateAccountNumber(accountNumber);

        if (isValid.status && isValid.iban) {
          infoElement.hide();
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          infoElement.show().text(langTxt.invalidFormat);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^SI\d{17}$/im);

      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        return {
          status: false
        };
      }
    }
  },

  bulgariaAccountNumber: {
    init: function () {
      this.actions();
    },

    actions: function () {
      var _self = this;
      jQuery('input.bank-nr').on('keyup change', function () {
        var $this = jQuery(this),
          accountNumber = $this.val().replace(/\s/g, ''),
          isValid = _self.validateAccountNumber(accountNumber),
          $infoElement = jQuery('#bankName');

        $infoElement.hide();
        $this.val($this.val().replace(/[^a-zA-Z0-9]/g, ''));

        if (isValid.status && isValid.iban) {
          $infoElement.hide();
          window.isBankAccountNumberValid = true;
          $this.removeClass('error').addClass('valid');
        } else {
          $infoElement.show().text(langTxt.enterValid);
          window.isBankAccountNumberValid = false;
          $this.removeClass('valid').addClass('error');
        }
      });
    },

    validateAccountNumber: function (accountNumber) {
      var isIban = accountNumber.match(/^BG\d{2}[a-zA-Z]{4}[0-9a-zA-Z]{14}$/im);
      if (isIban) {
        if (IBAN.isValid(accountNumber)) {
          return {
            status: true,
            iban: true
          };
        } else {
          return {
            status: false
          };
        }
      } else {
        if (!this.checkNumber(accountNumber)) {
          return {
            status: false
          };
        }
        return {
          status: true
        };
      }
    },

    checkNumber: function (number) {
      if (!number.match(/^BG\d{2}[a-zA-Z]{4}[0-9a-zA-Z]{14}$/im)) {
        return false;
      }
      return true;
    }
  }
};

(function(exports) {
  // Array.prototype.map polyfill
  // code from https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/map
  if (!Array.prototype.map) {
    Array.prototype.map = function(fun /*, thisArg */) {
      'use strict';

      if (this === void 0 || this === null) throw new TypeError();

      var t = Object(this);
      var len = t.length >>> 0;
      if (typeof fun !== 'function') throw new TypeError();

      var res = new Array(len);
      var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
      for (var i = 0; i < len; i++) {
        // NOTE: Absolute correctness would demand Object.defineProperty
        //       be used.  But this method is fairly new, and failure is
        //       possible only if Object.prototype or Array.prototype
        //       has a property |i| (very unlikely), so use a less-correct
        //       but more portable alternative.
        if (i in t) res[i] = fun.call(thisArg, t[i], i, t);
      }

      return res;
    };
  }

  var A = 'A'.charCodeAt(0),
    Z = 'Z'.charCodeAt(0);

  /**
   * Prepare an IBAN for mod 97 computation by moving the first 4 chars to the end and transforming the letters to
   * numbers (A = 10, B = 11, ..., Z = 35), as specified in ISO13616.
   *
   * @param {string} iban the IBAN
   * @returns {string} the prepared IBAN
   */
  function iso13616Prepare(iban) {
    iban = iban.toUpperCase();
    iban = iban.substr(4) + iban.substr(0, 4);

    return iban
      .split('')
      .map(function(n) {
        var code = n.charCodeAt(0);
        if (code >= A && code <= Z) {
          // A = 10, B = 11, ... Z = 35
          return code - A + 10;
        } else {
          return n;
        }
      })
      .join('');
  }

  /**
   * Calculates the MOD 97 10 of the passed IBAN as specified in ISO7064.
   *
   * @param iban
   * @returns {number}
   */
  function iso7064Mod97_10(iban) {
    var remainder = iban,
      block;

    while (remainder.length > 2) {
      block = remainder.slice(0, 9);
      remainder = (parseInt(block, 10) % 97) + remainder.slice(block.length);
    }

    return parseInt(remainder, 10) % 97;
  }

  /**
   * Parse the BBAN structure used to configure each IBAN Specification and returns a matching regular expression.
   * A structure is composed of blocks of 3 characters (one letter and 2 digits). Each block represents
   * a logical group in the typical representation of the BBAN. For each group, the letter indicates which characters
   * are allowed in this group and the following 2-digits number tells the length of the group.
   *
   * @param {string} structure the structure to parse
   * @returns {RegExp}
   */
  function parseStructure(structure) {
    // split in blocks of 3 chars
    var regex = structure.match(/(.{3})/g).map(function(block) {
      // parse each structure block (1-char + 2-digits)
      var format,
        pattern = block.slice(0, 1),
        repeats = parseInt(block.slice(1), 10);

      switch (pattern) {
        case 'A':
          format = '0-9A-Za-z';
          break;
        case 'B':
          format = '0-9A-Z';
          break;
        case 'C':
          format = 'A-Za-z';
          break;
        case 'F':
          format = '0-9';
          break;
        case 'L':
          format = 'a-z';
          break;
        case 'U':
          format = 'A-Z';
          break;
        case 'W':
          format = '0-9a-z';
          break;
      }

      return '([' + format + ']{' + repeats + '})';
    });

    return new RegExp('^' + regex.join('') + '$');
  }

  /**
   * Create a new Specification for a valid IBAN number.
   *
   * @param countryCode the code of the country
   * @param length the length of the IBAN
   * @param structure the structure of the undernying BBAN (for validation and formatting)
   * @param example an example valid IBAN
   * @constructor
   */
  function Specification(countryCode, length, structure, example) {
    this.countryCode = countryCode;
    this.length = length;
    this.structure = structure;
    this.example = example;
  }

  /**
   * Lazy-loaded regex (parse the structure and construct the regular expression the first time we need it for validation)
   */
  Specification.prototype._regex = function() {
    return this._cachedRegex || (this._cachedRegex = parseStructure(this.structure));
  };

  /**
   * Check if the passed iban is valid according to this specification.
   *
   * @param {String} iban the iban to validate
   * @returns {boolean} true if valid, false otherwise
   */
  Specification.prototype.isValid = function(iban) {
    return (
      this.length == iban.length &&
      this.countryCode === iban.slice(0, 2) &&
      this._regex().test(iban.slice(4)) &&
      iso7064Mod97_10(iso13616Prepare(iban)) == 1
    );
  };

  /**
   * Convert the passed IBAN to a country-specific BBAN.
   *
   * @param iban the IBAN to convert
   * @param separator the separator to use between BBAN blocks
   * @returns {string} the BBAN
   */
  Specification.prototype.toBBAN = function(iban, separator) {
    return this._regex()
      .exec(iban.slice(4))
      .slice(1)
      .join(separator);
  };

  /**
   * Convert the passed BBAN to an IBAN for this country specification.
   * Please note that <i>"generation of the IBAN shall be the exclusive responsibility of the bank/branch servicing the account"</i>.
   * This method implements the preferred algorithm described in http://en.wikipedia.org/wiki/International_Bank_Account_Number#Generating_IBAN_check_digits
   *
   * @param bban the BBAN to convert to IBAN
   * @returns {string} the IBAN
   */
  Specification.prototype.fromBBAN = function(bban) {
    if (!this.isValidBBAN(bban)) {
      throw new Error('Invalid BBAN');
    }

    var remainder = iso7064Mod97_10(iso13616Prepare(this.countryCode + '00' + bban)),
      checkDigit = ('0' + (98 - remainder)).slice(-2);

    return this.countryCode + checkDigit + bban;
  };

  /**
   * Check of the passed BBAN is valid.
   * This function only checks the format of the BBAN (length and matching the letetr/number specs) but does not
   * verify the check digit.
   *
   * @param bban the BBAN to validate
   * @returns {boolean} true if the passed bban is a valid BBAN according to this specification, false otherwise
   */
  Specification.prototype.isValidBBAN = function(bban) {
    return this.length - 4 == bban.length && this._regex().test(bban);
  };

  var countries = {};

  function addSpecification(IBAN) {
    countries[IBAN.countryCode] = IBAN;
  }

  addSpecification(new Specification('AD', 24, 'F04F04A12', 'AD1200012030200359100100'));
  addSpecification(new Specification('AE', 23, 'F03F16', 'AE070331234567890123456'));
  addSpecification(new Specification('AL', 28, 'F08A16', 'AL47212110090000000235698741'));
  addSpecification(new Specification('AT', 20, 'F05F11', 'AT611904300234573201'));
  addSpecification(new Specification('AZ', 28, 'U04A20', 'AZ21NABZ00000000137010001944'));
  addSpecification(new Specification('BA', 20, 'F03F03F08F02', 'BA391290079401028494'));
  addSpecification(new Specification('BE', 16, 'F03F07F02', 'BE68539007547034'));
  addSpecification(new Specification('BG', 22, 'U04F04F02A08', 'BG80BNBG96611020345678'));
  addSpecification(new Specification('BH', 22, 'U04A14', 'BH67BMAG00001299123456'));
  addSpecification(new Specification('BR', 29, 'F08F05F10U01A01', 'BR9700360305000010009795493P1'));
  addSpecification(new Specification('CH', 21, 'F05A12', 'CH9300762011623852957'));
  addSpecification(new Specification('CR', 21, 'F03F14', 'CR0515202001026284066'));
  addSpecification(new Specification('CY', 28, 'F03F05A16', 'CY17002001280000001200527600'));
  addSpecification(new Specification('CZ', 24, 'F04F06F10', 'CZ6508000000192000145399'));
  addSpecification(new Specification('DE', 22, 'F08F10', 'DE89370400440532013000'));
  addSpecification(new Specification('DK', 18, 'F04F09F01', 'DK5000400440116243'));
  addSpecification(new Specification('DO', 28, 'U04F20', 'DO28BAGR00000001212453611324'));
  addSpecification(new Specification('EE', 20, 'F02F02F11F01', 'EE382200221020145685'));
  addSpecification(new Specification('ES', 24, 'F04F04F01F01F10', 'ES9121000418450200051332'));
  addSpecification(new Specification('FI', 18, 'F06F07F01', 'FI2112345600000785'));
  addSpecification(new Specification('FO', 18, 'F04F09F01', 'FO6264600001631634'));
  addSpecification(new Specification('FR', 27, 'F05F05A11F02', 'FR1420041010050500013M02606'));
  addSpecification(new Specification('GB', 22, 'U04F06F08', 'GB29NWBK60161331926819'));
  addSpecification(new Specification('GE', 22, 'U02F16', 'GE29NB0000000101904917'));
  addSpecification(new Specification('GI', 23, 'U04A15', 'GI75NWBK000000007099453'));
  addSpecification(new Specification('GL', 18, 'F04F09F01', 'GL8964710001000206'));
  addSpecification(new Specification('GR', 27, 'F03F04A16', 'GR1601101250000000012300695'));
  addSpecification(new Specification('GT', 28, 'A04A20', 'GT82TRAJ01020000001210029690'));
  addSpecification(new Specification('HR', 21, 'F07F10', 'HR1210010051863000160'));
  addSpecification(new Specification('HU', 28, 'F03F04F01F15F01', 'HU42117730161111101800000000'));
  addSpecification(new Specification('IE', 22, 'U04F06F08', 'IE29AIBK93115212345678'));
  addSpecification(new Specification('IL', 23, 'F03F03F13', 'IL620108000000099999999'));
  addSpecification(new Specification('IS', 26, 'F04F02F06F10', 'IS140159260076545510730339'));
  addSpecification(new Specification('IT', 27, 'U01F05F05A12', 'IT60X0542811101000000123456'));
  addSpecification(new Specification('KW', 30, 'U04A22', 'KW81CBKU0000000000001234560101'));
  addSpecification(new Specification('KZ', 20, 'F03A13', 'KZ86125KZT5004100100'));
  addSpecification(new Specification('LB', 28, 'F04A20', 'LB62099900000001001901229114'));
  addSpecification(new Specification('LI', 21, 'F05A12', 'LI21088100002324013AA'));
  addSpecification(new Specification('LT', 20, 'F05F11', 'LT121000011101001000'));
  addSpecification(new Specification('LU', 20, 'F03A13', 'LU280019400644750000'));
  addSpecification(new Specification('LV', 21, 'U04A13', 'LV80BANK0000435195001'));
  addSpecification(new Specification('MC', 27, 'F05F05A11F02', 'MC5811222000010123456789030'));
  addSpecification(new Specification('MD', 24, 'U02F18', 'MD24AG000225100013104168'));
  addSpecification(new Specification('ME', 22, 'F03F13F02', 'ME25505000012345678951'));
  addSpecification(new Specification('MK', 19, 'F03A10F02', 'MK07250120000058984'));
  addSpecification(new Specification('MR', 27, 'F05F05F11F02', 'MR1300020001010000123456753'));
  addSpecification(new Specification('MT', 31, 'U04F05A18', 'MT84MALT011000012345MTLCAST001S'));
  addSpecification(new Specification('MU', 30, 'U04F02F02F12F03U03', 'MU17BOMM0101101030300200000MUR'));
  addSpecification(new Specification('NL', 18, 'U04F10', 'NL91ABNA0417164300'));
  addSpecification(new Specification('NO', 15, 'F04F06F01', 'NO9386011117947'));
  addSpecification(new Specification('PK', 24, 'U04A16', 'PK36SCBL0000001123456702'));
  addSpecification(new Specification('PL', 28, 'F08F16', 'PL61109010140000071219812874'));
  addSpecification(new Specification('PS', 29, 'U04A21', 'PS92PALS000000000400123456702'));
  addSpecification(new Specification('PT', 25, 'F04F04F11F02', 'PT50000201231234567890154'));
  addSpecification(new Specification('RO', 24, 'U04A16', 'RO49AAAA1B31007593840000'));
  addSpecification(new Specification('RS', 22, 'F03F13F02', 'RS35260005601001611379'));
  addSpecification(new Specification('SA', 24, 'F02A18', 'SA0380000000608010167519'));
  addSpecification(new Specification('SE', 24, 'F03F16F01', 'SE4550000000058398257466'));
  addSpecification(new Specification('SI', 19, 'F05F08F02', 'SI56263300012039086'));
  addSpecification(new Specification('SK', 24, 'F04F06F10', 'SK3112000000198742637541'));
  addSpecification(new Specification('SM', 27, 'U01F05F05A12', 'SM86U0322509800000000270100'));
  addSpecification(new Specification('TN', 24, 'F02F03F13F02', 'TN5910006035183598478831'));
  addSpecification(new Specification('TR', 26, 'F05A01A16', 'TR330006100519786457841326'));
  addSpecification(new Specification('VG', 24, 'U04F16', 'VG96VPVG0000012345678901'));

  // Angola
  addSpecification(new Specification('AO', 25, 'F21', 'AO69123456789012345678901'));
  // Burkina
  addSpecification(new Specification('BF', 27, 'F23', 'BF2312345678901234567890123'));
  // Burundi
  addSpecification(new Specification('BI', 16, 'F12', 'BI41123456789012'));
  // Benin
  addSpecification(new Specification('BJ', 28, 'F24', 'BJ39123456789012345678901234'));
  // Ivory
  addSpecification(new Specification('CI', 28, 'U01F23', 'CI17A12345678901234567890123'));
  // Cameron
  addSpecification(new Specification('CM', 27, 'F23', 'CM9012345678901234567890123'));
  // Cape Verde
  addSpecification(new Specification('CV', 25, 'F21', 'CV30123456789012345678901'));
  // Algeria
  addSpecification(new Specification('DZ', 24, 'F20', 'DZ8612345678901234567890'));
  // Iran
  addSpecification(new Specification('IR', 26, 'F22', 'IR861234568790123456789012'));
  // Jordan
  addSpecification(new Specification('JO', 30, 'A04F22', 'JO15AAAA1234567890123456789012'));
  // Madagascar
  addSpecification(new Specification('MG', 27, 'F23', 'MG1812345678901234567890123'));
  // Mali
  addSpecification(new Specification('ML', 28, 'U01F23', 'ML15A12345678901234567890123'));
  // Mozambique
  addSpecification(new Specification('MZ', 25, 'F21', 'MZ25123456789012345678901'));
  // Quatar
  addSpecification(new Specification('QA', 29, 'U04A21', 'QA30AAAA123456789012345678901'));
  // Senegal
  addSpecification(new Specification('SN', 28, 'U01F23', 'SN52A12345678901234567890123'));
  // Ukraine
  addSpecification(new Specification('UA', 29, 'F25', 'UA511234567890123456789012345'));

  var NON_ALPHANUM = /[^a-zA-Z0-9]/g,
    EVERY_FOUR_CHARS = /(.{4})(?!$)/g;

  /**
   * Utility function to check if a variable is a String.
   *
   * @param v
   * @returns {boolean} true if the passed variable is a String, false otherwise.
   */
  function isString(v) {
    return typeof v == 'string' || v instanceof String;
  }

  /**
   * Check if an IBAN is valid.
   *
   * @param {String} iban the IBAN to validate.
   * @returns {boolean} true if the passed IBAN is valid, false otherwise
   */
  exports.isValid = function(iban) {
    if (!isString(iban)) {
      return false;
    }
    iban = this.electronicFormat(iban);
    var countryStructure = countries[iban.slice(0, 2)];
    return !!countryStructure && countryStructure.isValid(iban);
  };

  /**
   * Convert an IBAN to a BBAN.
   *
   * @param iban
   * @param {String} [separator] the separator to use between the blocks of the BBAN, defaults to ' '
   * @returns {string|*}
   */
  exports.toBBAN = function(iban, separator) {
    if (typeof separator == 'undefined') {
      separator = ' ';
    }
    iban = this.electronicFormat(iban);
    var countryStructure = countries[iban.slice(0, 2)];
    if (!countryStructure) {
      throw new Error('No country with code ' + iban.slice(0, 2));
    }
    return countryStructure.toBBAN(iban, separator);
  };

  /**
   * Convert the passed BBAN to an IBAN for this country specification.
   * Please note that <i>"generation of the IBAN shall be the exclusive responsibility of the bank/branch servicing the account"</i>.
   * This method implements the preferred algorithm described in http://en.wikipedia.org/wiki/International_Bank_Account_Number#Generating_IBAN_check_digits
   *
   * @param countryCode the country of the BBAN
   * @param bban the BBAN to convert to IBAN
   * @returns {string} the IBAN
   */
  exports.fromBBAN = function(countryCode, bban) {
    var countryStructure = countries[countryCode];
    if (!countryStructure) {
      throw new Error('No country with code ' + countryCode);
    }
    return countryStructure.fromBBAN(this.electronicFormat(bban));
  };

  /**
   * Check the validity of the passed BBAN.
   *
   * @param countryCode the country of the BBAN
   * @param bban the BBAN to check the validity of
   */
  exports.isValidBBAN = function(countryCode, bban) {
    if (!isString(bban)) {
      return false;
    }
    var countryStructure = countries[countryCode];
    return countryStructure && countryStructure.isValidBBAN(this.electronicFormat(bban));
  };

  /**
   *
   * @param iban
   * @param separator
   * @returns {string}
   */
  exports.printFormat = function(iban, separator) {
    if (typeof separator == 'undefined') {
      separator = ' ';
    }
    return this.electronicFormat(iban).replace(EVERY_FOUR_CHARS, '$1' + separator);
  };

  /**
   *
   * @param iban
   * @returns {string}
   */
  exports.electronicFormat = function(iban) {
    return iban.replace(NON_ALPHANUM, '').toUpperCase();
  };

  /**
   * An object containing all the known IBAN specifications.
   */
  exports.countries = countries;
})(typeof exports == 'undefined' ? (this.IBAN = {}) : exports);
