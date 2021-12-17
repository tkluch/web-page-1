var newsletterFormValidation = function (successAdditionalCallback, ajaxErrorCallback) {
    var newsletterPageForm = document.getElementById('newsletterPageForm'),
        rules,
        inputMail = document.getElementById('newsletterMail'),
        emailLabel = document.querySelector('.newsletter-mail-label'),
        existEmailErrElem = document.createElement('label');
    if (!newsletterPageForm) {
        return;
    }

    if (inputMail) {
        inputMail.addEventListener("input", function (e) {
            if (emailLabel) {
                if (e.target.value) {
                    emailLabel.classList.add('active');
                } else {
                    emailLabel.classList.remove('active');
                }
            }
            const existEmailError = document.querySelector('.existEmailError');
            if (existEmailError) {
                document.querySelector('div.input-wrapper').removeChild(existEmailError);
            }

        })
    }

    rules = getValidationRules();
    let departmentRule = "";
    let departmentMessage = "";
    if (rules.customer_department) {
        departmentRule = rules.customer_department.is_required;
        departmentMessage = rules.customer_department.validation_key_required;
    }
    jQuery(newsletterPageForm).validate({
        rules: {
            email: {
                required: rules.customer_email.is_required,
                pattern: rules.customer_email.pattern_validation
            },
            newsletterTerms: {
                required: true
            },
            "newsletterDepartment[]": {
                required: departmentRule
            }
        },
        messages: {
            email: {
                required: rules.customer_email.validation_key_required,
                pattern: rules.customer_email.validation_key_illegal
            },
            newsletterTerms: {
                required: rules.customer_address_additional_information.validation_key_required
            },
            "newsletterDepartment[]": {
                required: departmentMessage
            }
        },
        submitHandler: function (form) {
            var data = new URLSearchParams(),
                emailElement = document.getElementById('newsletterMail'),
                subscriptionPlaceElement = form.querySelector('.ai-subscription-place'),
                departmentElements = document.querySelectorAll('input[name="newsletterDepartment[]"]:checked');
            if (!emailElement || !subscriptionPlaceElement) {
                return;
            }
            if (departmentElements.length !== 0) {
                for (var i = 0; i < departmentElements.length; i++) {
                    data.append('departments[]', departmentElements[i].value)
                }
            }
            data.append('email', emailElement.value);
            data.append('subscriptionPlace', subscriptionPlaceElement.value);
            LegacyBridge.fetchData(form.dataset.url, data.toString(), 'post')
                .then(function (response) {
                    return response.json();
                })
                .then(function (json) {
                    if (json.status) {
                        if (typeof successAdditionalCallback === 'function') {
                            successAdditionalCallback();
                        }
                        if (typeof lppshared !== 'undefined' && typeof lppshared.newsletter !== 'undefined') {
                            lppShared.newsletter.setCookie(3);
                        }
                        if (typeof RESERVED !== 'undefined' && typeof RESERVED.newsletterCookie !== 'undefined') {
                            RESERVED.newsletterCookie.setCookie(3);
                        }
                        const DY = window.DY || "";
                        const DYO = window.DYO || "";
                        if (DY && DYO) {
                            DY.API("event", {
                                name: "Newsletter Subscription",
                                properties: {
                                    dyType: "newsletter-subscription-v1",
                                    hashedEmail: DYO.dyhash.sha256(emailElement.value.toLowerCase())
                                }
                            });
                        }
                        setTimeout(function () {
                            window.location.href = form.dataset.success;
                        }, 100)
                    } else {
                        window.dataLayer = window.dataLayer || [];
                        window.dataLayer.push({'event': 'newsletter', 'action': 'signup', 'label': 'fail'});
                        if (typeof ajaxErrorCallback === 'function') {
                            ajaxErrorCallback(json.message);
                        } else {
                            existEmailErrElem.innerText = json.message;
                            existEmailErrElem.classList.add('existEmailError');
                            document.querySelector('div.input-wrapper').appendChild(existEmailErrElem);
                        }
                    }
                }).catch(function (error) {
                // brak obsługi błędów
            });
        }
    });
};
