(function() {
    document.addEventListener('DOMContentLoaded', function() {
        var serverInfoBox = document.getElementById('newsletterServerInfo');
        newsletterFormValidation(function() {
            serverInfoBox.style.display = 'none';
        }, function(message) {
            serverInfoBox.innerHTML = message;
            serverInfoBox.style.display = 'block';
        });
    }, false);
})();
