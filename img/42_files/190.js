(window.NArchWebpackJsonp=window.NArchWebpackJsonp||[]).push([[190],{"./packages/apps/product-card/src/product-card/recommended/recommended-products.tsx":function(e,c,d){"use strict";d.d(c,"a",(function(){return RecommendedProductsComponent}));var a=d("./node_modules/react/index.js"),t=d.n(a),r=d("./packages/libs/analytics/src/index.tsx"),n=d("./packages/libs/core/src/index.ts"),s=d("./packages/libs/recommended/src/index.tsx"),o=d("./packages/libs/sticker/src/index.tsx"),RecommendedProductsComponent=function(e){var c=e.displayRecommended,d=e.products,u=e.productSku,i=e.brandId,m=Object(r.useProductCardAnalytics)().recommendedProductsLoaded;return Object(a.useEffect)((function(){(null==d?void 0:d.length)&&m(d,u,i,s.Variants.Standard)}),[d]),c?t.a.createElement("div",{className:"recommended-wrapper"},t.a.createElement("section",{className:"recommended-products","data-selen":"recommended-products"},t.a.createElement(r.AnalyticsProvider,null,t.a.createElement(s.default,{products:d,stickerRole:o.c.Recommended,key:"recommended-"+u,analyticsEventName:r.RECOMMENDATION_CLICK,enableRecommendedOverwrite:!0,variant:s.Variants.Standard,title:t.a.createElement(n.Translate,{msgid:"Recommended"})})))):null}},"./packages/apps/product-card/src/product-card/recommended/variants/standard-recommended.tsx":function(e,c,d){"use strict";d.r(c),d.d(c,"StandardRecommended",(function(){return StandardRecommended}));var a=d("./node_modules/react/index.js"),t=d.n(a),r=d("./packages/apps/product-card/src/product-card/recommended/recommended-products.tsx"),n=d("./packages/apps/product-card/src/product-card/recommended/variants/test-analytics-hook.tsx"),StandardRecommended=function(e){var c=e.displayRecommended,d=e.products,a=e.productSku,s=e.brandId,o=e.variantName;return Object(n.a)(o,!!(null==d?void 0:d.length)),t.a.createElement(r.a,{displayRecommended:c,products:d,productSku:a,brandId:s})};c.default=StandardRecommended},"./packages/apps/product-card/src/product-card/recommended/variants/test-analytics-hook.tsx":function(e,c,d){"use strict";d.d(c,"a",(function(){return useTestAnalytics}));var a=d("./node_modules/react/index.js"),t=d("./packages/libs/analytics/src/index.tsx"),useTestAnalytics=function(e,c){var d=Object(t.createDataLayerEvent)("testDataScienceRecommended");Object(a.useEffect)((function(){e&&d({testVersion:{cd63:e,hasProducts:c}})}),[])}}}]);