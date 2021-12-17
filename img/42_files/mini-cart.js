(function () {
    try {
        if (window.LegacyBridge) {
            window.LegacyBridge.loadMinicart();
        }
    } catch (e) {
        console.error(e);
    }
})();
