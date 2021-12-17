(window.NArchWebpackJsonp=window.NArchWebpackJsonp||[]).push([[183],{"./packages/libs/sticker/src/components/StickerConfigComponent/index.tsx":function(n,i,e){"use strict";var t=e("./node_modules/react/index.js"),s=e.n(t),r=e("./packages/libs/sticker/src/utils/index.ts");i.a=function(n){var i=n.config,e=n.stickers,t=n.location,a=n.group,o=n.children,c=Object(r.d)(i,t,a),l=c.visibility,p=c.quantity;if(!l)return null;var d=Object(r.b)(a,e,p);return d.length?s.a.createElement(s.a.Fragment,null,o(d)):null}},"./packages/libs/sticker/src/sinsay/config.ts":function(n,i,e){"use strict";e.d(i,"a",(function(){return p}));var t,s,r,a,o,c,l=e("./packages/libs/sticker/src/sticker-interfaces.ts"),p=((t={})[l.b.Configurable]=((s={})[l.a.Primary]={visibility:!1},s[l.a.Secondary]={visibility:!0,quantity:1},s[l.a.Tertiary]={visibility:!0,quantity:2},s[l.a.Quaternary]={visibility:!0,quantity:1},s),t[l.b.Product]=((r={})[l.a.Primary]={visibility:!1},r[l.a.Secondary]={visibility:!1},r[l.a.Tertiary]={visibility:!0,quantity:2},r[l.a.Quaternary]={visibility:!0,quantity:1},r),t[l.b.Recommended]=((a={})[l.a.Primary]={visibility:!1},a[l.a.Secondary]={visibility:!0},a[l.a.Tertiary]={visibility:!1},a[l.a.Quaternary]={visibility:!0},a),t[l.b.ShopByLook]=((o={})[l.a.Primary]={visibility:!1},o[l.a.Secondary]={visibility:!0},o[l.a.Tertiary]={visibility:!1},o[l.a.Quaternary]={visibility:!0,quantity:1},o),t[l.b.DataScienceRecommended]=((c={})[l.a.Primary]={visibility:!1},c[l.a.Secondary]={visibility:!0},c[l.a.Tertiary]={visibility:!1},c[l.a.Quaternary]={visibility:!0,quantity:1},c),t)},"./packages/libs/sticker/src/sinsay/group.component.tsx":function(n,i,e){"use strict";e.r(i);var t=e("./node_modules/tslib/tslib.es6.js"),s=e("./node_modules/react/index.js"),r=e.n(s),a=e("./packages/libs/sticker/src/sinsay/sticker.component.tsx"),o=e("./packages/libs/sticker/src/sinsay/group.styled.tsx"),c=e("./packages/libs/sticker/src/utils/index.ts"),l=e("./packages/libs/sticker/src/components/StickerConfigComponent/index.tsx"),p=e("./packages/libs/sticker/src/sinsay/config.ts");i.default=function(n){return r.a.createElement(l.a,Object(t.a)({config:p.a},n),(function(i){return r.a.createElement(o.a,{className:"group-"+n.group+" location-"+n.location},i.map((function(i,e){return r.a.createElement(a.a,{key:e,text:i.text,color:(null==i?void 0:i.color)?i.color:Object(c.a)(n.group),className:n.className,style:Object(c.e)(n.group,i.color)})})))}))}},"./packages/libs/sticker/src/sinsay/group.styled.tsx":function(n,i,e){"use strict";e.d(i,"a",(function(){return l}));var t,s=e("./node_modules/tslib/tslib.es6.js"),r=e("./node_modules/styled-components/dist/styled-components.browser.esm.js"),a=e("./packages/libs/theme/src/index.tsx"),o=e("./packages/libs/sticker/src/sinsay/sticker.styled.tsx"),c=e("./packages/libs/sticker/src/sticker-interfaces.ts"),l=r.g.div(t||(t=Object(s.g)(["\n  &.group-"," {\n    order: 1;\n  }\n\n  &.group-"," {\n    order: 3;\n\n    "," {\n      display: inline-block;\n      margin-right: 5px;\n      width: auto;\n    }\n  }\n\n  &.group-"," {\n    order: 4;\n  }\n\n  &.group-"," {\n    position: absolute;\n    top: 0;\n    left: 0;\n    pointer-events: none;\n\n    "," {\n      padding: 3px 5px;\n      color: white;\n      font-weight: 600;\n      font-size: 11px;\n      letter-spacing: 0.3px;\n    }\n  }\n\n  &.group-",".location-"," {\n    "," {\n      border-radius: 2px;\n    }\n  }\n\n  &.group-",".location-"," {\n    margin-top: 5px;\n    display: flex;\n    grid-gap: 2px;\n    flex-direction: column;\n    @media screen and (min-width: ","px) {\n      flex-direction: initial;\n    }\n  }\n\n  &.group-",".location-"," {\n    grid-area: tertiaryStickers;\n    display: flex;\n    width: calc(100% - 40px);\n    margin: 0 auto 14px;\n    grid-gap: 12px;\n    div {\n      font-size: 13px;\n    }\n    @media screen and (min-width: ","px) {\n      order: -1;\n      margin: 20px 0;\n      grid-gap: 0;\n    }\n  }\n"],["\n  &.group-"," {\n    order: 1;\n  }\n\n  &.group-"," {\n    order: 3;\n\n    "," {\n      display: inline-block;\n      margin-right: 5px;\n      width: auto;\n    }\n  }\n\n  &.group-"," {\n    order: 4;\n  }\n\n  &.group-"," {\n    position: absolute;\n    top: 0;\n    left: 0;\n    pointer-events: none;\n\n    "," {\n      padding: 3px 5px;\n      color: white;\n      font-weight: 600;\n      font-size: 11px;\n      letter-spacing: 0.3px;\n    }\n  }\n\n  &.group-",".location-"," {\n    "," {\n      border-radius: 2px;\n    }\n  }\n\n  &.group-",".location-"," {\n    margin-top: 5px;\n    display: flex;\n    grid-gap: 2px;\n    flex-direction: column;\n    @media screen and (min-width: ","px) {\n      flex-direction: initial;\n    }\n  }\n\n  &.group-",".location-"," {\n    grid-area: tertiaryStickers;\n    display: flex;\n    width: calc(100% - 40px);\n    margin: 0 auto 14px;\n    grid-gap: 12px;\n    div {\n      font-size: 13px;\n    }\n    @media screen and (min-width: ","px) {\n      order: -1;\n      margin: 20px 0;\n      grid-gap: 0;\n    }\n  }\n"])),c.a.Primary,c.a.Secondary,o.a,c.a.Tertiary,c.a.Quaternary,o.a,c.a.Quaternary,c.b.Product,o.a,c.a.Tertiary,c.b.Configurable,a.TABLET_BREAKPOINT_MIN,c.a.Tertiary,c.b.Product,a.TABLET_BREAKPOINT_MIN)},"./packages/libs/sticker/src/sinsay/sticker.component.tsx":function(n,i,e){"use strict";e.d(i,"a",(function(){return Sticker}));var t=e("./node_modules/react/index.js"),s=e("./packages/libs/sticker/src/sinsay/sticker.styled.tsx"),Sticker=function(n){var i=n.className,e=void 0===i?"es-sticker":i,r=n.text,a=n.style;return t.createElement(s.a,{className:e,style:a},t.createElement("span",{dangerouslySetInnerHTML:{__html:r}}))}},"./packages/libs/sticker/src/sinsay/sticker.styled.tsx":function(n,i,e){"use strict";e.d(i,"a",(function(){return o}));var t,s=e("./node_modules/tslib/tslib.es6.js"),r=e("./node_modules/styled-components/dist/styled-components.browser.esm.js"),a=e("./packages/libs/theme/src/index.tsx"),o=r.g.div(t||(t=Object(s.g)(["\n  order: 1;\n\n  && {\n    font-size: 9px;\n    letter-spacing: 0.5px;\n    text-align: left;\n    margin-top: 0;\n    white-space: normal;\n    overflow: hidden;\n    text-overflow: ellipsis;\n\n    span {\n      display: block;\n      font-weight: 600;\n      width: 100%;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    @media screen and (min-width: ","px) {\n      padding: 0;\n      letter-spacing: 0.6px;\n      font-size: 10px;\n      margin-right: 10px;\n\n      span {\n        font-weight: 600;\n      }\n    }\n  }\n"],["\n  order: 1;\n\n  && {\n    font-size: 9px;\n    letter-spacing: 0.5px;\n    text-align: left;\n    margin-top: 0;\n    white-space: normal;\n    overflow: hidden;\n    text-overflow: ellipsis;\n\n    span {\n      display: block;\n      font-weight: 600;\n      width: 100%;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    @media screen and (min-width: ","px) {\n      padding: 0;\n      letter-spacing: 0.6px;\n      font-size: 10px;\n      margin-right: 10px;\n\n      span {\n        font-weight: 600;\n      }\n    }\n  }\n"])),a.TABLET_BREAKPOINT_MIN)}}]);