(function(w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
    var f = d.getElementsByTagName('head')[0], j = d.createElement(s), dl = l != 'dataLayer' ? '&l=' + l : '';
    j.async = false;
    j.defer = window.global.performance ? window.global.performance.asyncAssets : false;
    j.src = '//www.googletagmanager.com/gtm.js?id=' + i + dl;
    f.appendChild(j);
})(window, document, 'script', 'dataLayer', window.global.gtm.containerId);
