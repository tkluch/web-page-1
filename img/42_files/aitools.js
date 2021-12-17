var aiTools = aiTools || {
};
aiTools.cookie = {
    setCookie: function (cname, cvalue, expiresDate) {
        var expires = '';
        if(expiresDate !== 'undefined' && expiresDate instanceof Date){
            expires = 'expires=' + expiresDate.toUTCString() + ';';
        }
        document.cookie = cname + '=' + cvalue + ';' + expires + 'path=/' + ';secure';
    },
    getCookie: function (cname) {
        var name = cname + '=';
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
                return c.substring(name.length, c.length);
            }
        }
        return '';
    },
    counter: function (cName) {
        var counter = aiTools.cookie.getCookie(cName);
        if(counter === ''){
            counter = 0;
        }
        var cValue = parseInt(counter) + 1;
        aiTools.cookie.setCookie(cName, cValue);
        return cValue;
    }
}
aiTools.notRegVal = {
    value: null,
    get: function () {
        if (!this.value) {
            this.value = this.checkValue();
        }
        return this.value;
    },
    checkValue: function () {
        var reuid = aiTools.cookie.getCookie('re_uid'),
            notreg = aiTools.cookie.getCookie('not_reg'),
            first = aiTools.cookie.getCookie('first_30');
        if (first) {
            return 2;
        }
        if (reuid) {
            return 1;
        }
        if (notreg) {
            return 3;
        }
        var expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);
        aiTools.cookie.setCookie('not_reg', '1', expiryDate);
        var expiryDate30 = new Date();
        expiryDate30.setMinutes(expiryDate30.getMinutes() + 30);
        aiTools.cookie.setCookie('first_30', '1', expiryDate30);
        return 2;
    }
}
aiTools.testsAB = {
    tests: {
    },
    testPrototype: {
        value: null,
        callback: null,
        prepareTestValue: function () {
            var testVariant = Math.floor(Math.random() * this.splites);
            return testVariant;
        },
        getValue: function () {
            if (this.value) {
                return this.value;
            }
            this.value = aiTools.cookie.getCookie(this.name);
            if (this.value.length === 0) {
                this.value = this.prepareTestValue();
                var expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 60);
                aiTools.cookie.setCookie(this.name, this.value, expiryDate);
            }
            return this.value;
        },
    },
    start: function (name, splites, callback) {
        var test = Object.create(this.testPrototype);
        test.name = name;
        test.splites = splites;
        test.getValue();
        this.tests[name] = test;
        if (callback) {
            test.callback = callback;
            test.callback();
        }
        return test;
    }
}
aiTools.ajaxSuccessEvent = function () {
    var gtmAjaxAnalyser = function(event, jqXHR, ajaxOptions, data) {
        var qd = {};
        if (ajaxOptions.data) {
            ajaxOptions.data.split("&").forEach(function(item) {(item.split("=")[0] in qd) ? qd[item.split("=")[0]].push(item.split("=")[1]) : qd[item.split("=")[0]] = [item.split("=")[1]]});
        }
        dataLayer.push({
            event: event.type,
            ajax: {
                request: {
                    method: ajaxOptions.type, // GET, POST, PUT, DELETE, etc ...
                    url: ajaxOptions.url,
                    data: ajaxOptions.data,
                    dataDecoded:qd,
                    contentType: ajaxOptions.contentType
                },
                response: {
                    url: jqXHR.responseURL,
                    status: jqXHR.status,
                    statusText: jqXHR.statusText,
                    message: data.message,
                    data: data
                }
            }
        });
    };
    if (window.jQuery) {
        jQuery(document).ajaxSuccess(gtmAjaxAnalyser);
        jQuery(document).ajaxError(gtmAjaxAnalyser);
    }
}
aiTools.init = function () {
    aiTools.ajaxSuccessEvent();
}
aiTools.init()
