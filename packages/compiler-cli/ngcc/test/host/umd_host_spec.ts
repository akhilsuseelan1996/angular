/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';

import {ClassMemberKind, CtorParameter, Import, isNamedClassDeclaration, isNamedFunctionDeclaration, isNamedVariableDeclaration} from '../../../src/ngtsc/reflection';
import {Esm2015ReflectionHost} from '../../src/host/esm2015_host';
import {getIifeBody} from '../../src/host/esm5_host';
import {UmdReflectionHost} from '../../src/host/umd_host';
import {MockLogger} from '../helpers/mock_logger';
import {getDeclaration, makeTestBundleProgram} from '../helpers/utils';

import {expectTypeValueReferencesForParameters} from './util';

const SOME_DIRECTIVE_FILE = {
  name: '/some_directive.umd.js',
  contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
  typeof define === 'function' && define.amd ? define('some_directive', ['exports', '@angular/core'], factory) :
  (factory(global.some_directive,global.ng.core));
}(this, (function (exports,core) { 'use strict';

  var INJECTED_TOKEN = new InjectionToken('injected');
  var ViewContainerRef = {};
  var TemplateRef = {};

  var SomeDirective = (function() {
    function SomeDirective(_viewContainer, _template, injected) {
      this.instanceProperty = 'instance';
    }
    SomeDirective.prototype = {
      instanceMethod: function() {},
    };
    SomeDirective.staticMethod = function() {};
    SomeDirective.staticProperty = 'static';
    SomeDirective.decorators = [
      { type: core.Directive, args: [{ selector: '[someDirective]' },] }
    ];
    SomeDirective.ctorParameters = function() { return [
      { type: ViewContainerRef, },
      { type: TemplateRef, },
      { type: undefined, decorators: [{ type: core.Inject, args: [INJECTED_TOKEN,] },] },
    ]; };
    SomeDirective.propDecorators = {
      "input1": [{ type: core.Input },],
      "input2": [{ type: core.Input },],
    };
    return SomeDirective;
  }());
  exports.SomeDirective = SomeDirective;
})));`,
};

const SIMPLE_ES2015_CLASS_FILE = {
  name: '/simple_es2015_class.d.ts',
  contents: `
    export class EmptyClass {}
  `,
};

const SIMPLE_CLASS_FILE = {
  name: '/simple_class.js',
  contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define('simple_class', ['exports'], factory) :
  (factory(global.simple_class));
}(this, (function (exports) { 'use strict';
  var EmptyClass = (function() {
    function EmptyClass() {
    }
    return EmptyClass;
  }());
  var NoDecoratorConstructorClass = (function() {
    function NoDecoratorConstructorClass(foo) {
    }
    return NoDecoratorConstructorClass;
  }());
  exports.EmptyClass = EmptyClass;
  exports.NoDecoratorConstructorClass = NoDecoratorConstructorClass;
})));`,
};

const FOO_FUNCTION_FILE = {
  name: '/foo_function.js',
  contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
  typeof define === 'function' && define.amd ? define('foo_function', ['exports', '@angular/core'], factory) :
  (factory(global.foo_function,global.ng.core));
}(this, (function (exports,core) { 'use strict';
  function foo() {}
  foo.decorators = [
    { type: core.Directive, args: [{ selector: '[ignored]' },] }
  ];
  exports.foo = foo;
})));`,
};

const INVALID_DECORATORS_FILE = {
  name: '/invalid_decorators.js',
  contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
  typeof define === 'function' && define.amd ? define('invalid_decorators', ['exports', '@angular/core'], factory) :
  (factory(global.invalid_decorators, global.ng.core));
}(this, (function (exports,core) { 'use strict';
  var NotArrayLiteral = (function() {
    function NotArrayLiteral() {
    }
    NotArrayLiteral.decorators = () => [
      { type: core.Directive, args: [{ selector: '[ignored]' },] },
    ];
    return NotArrayLiteral;
  }());

  var NotObjectLiteral = (function() {
    function NotObjectLiteral() {
    }
    NotObjectLiteral.decorators = [
      "This is not an object literal",
      { type: core.Directive },
    ];
    return NotObjectLiteral;
  }());

  var NoTypeProperty = (function() {
    function NoTypeProperty() {
    }
    NoTypeProperty.decorators = [
      { notType: core.Directive },
      { type: core.Directive },
    ];
    return NoTypeProperty;
  }());

  var NotIdentifier = (function() {
    function NotIdentifier() {
    }
    NotIdentifier.decorators = [
      { type: 'StringsLiteralsAreNotIdentifiers' },
      { type: core.Directive },
    ];
    return NotIdentifier;
  }());
})));`,
};

const INVALID_DECORATOR_ARGS_FILE = {
  name: '/invalid_decorator_args.js',
  contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
  typeof define === 'function' && define.amd ? define('invalid_decorator_args', ['exports', '@angular/core'], factory) :
  (factory(global.invalid_decorator_args, global.ng.core));
}(this, (function (exports,core) { 'use strict';
  var NoArgsProperty = (function() {
    function NoArgsProperty() {
    }
    NoArgsProperty.decorators = [
      { type: core.Directive },
    ];
    return NoArgsProperty;
  }());

  var args = [{ selector: '[ignored]' },];
  var NoPropertyAssignment = (function() {
    function NoPropertyAssignment() {
    }
    NoPropertyAssignment.decorators = [
      { type: core.Directive, args },
    ];
    return NoPropertyAssignment;
  }());

  var NotArrayLiteral = (function() {
    function NotArrayLiteral() {
    }
    NotArrayLiteral.decorators = [
      { type: core.Directive, args: () => [{ selector: '[ignored]' },] },
    ];
    return NotArrayLiteral;
  }());
})));`,
};

const INVALID_PROP_DECORATORS_FILE = {
  name: '/invalid_prop_decorators.js',
  contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
  typeof define === 'function' && define.amd ? define('invalid_prop_decorators', ['exports', '@angular/core'], factory) :
  (factory(global.invalid_prop_decorators, global.ng.core));
}(this, (function (exports,core) { 'use strict';
  var NotObjectLiteral = (function() {
    function NotObjectLiteral() {
    }
    NotObjectLiteral.propDecorators = () => ({
      "prop": [{ type: core.Directive },]
    });
    return NotObjectLiteral;
  }());

  var NotObjectLiteralProp = (function() {
    function NotObjectLiteralProp() {
    }
    NotObjectLiteralProp.propDecorators = {
      "prop": [
        "This is not an object literal",
        { type: core.Directive },
      ]
    };
    return NotObjectLiteralProp;
  }());

  var NoTypeProperty = (function() {
    function NoTypeProperty() {
    }
    NoTypeProperty.propDecorators = {
      "prop": [
        { notType: core.Directive },
        { type: core.Directive },
      ]
    };
    return NoTypeProperty;
  }());

  var NotIdentifier = (function() {
    function NotIdentifier() {
    }
    NotIdentifier.propDecorators = {
      "prop": [
        { type: 'StringsLiteralsAreNotIdentifiers' },
        { type: core.Directive },
      ]
    };
    return NotIdentifier;
  }());
})));`,
};

const INVALID_PROP_DECORATOR_ARGS_FILE = {
  name: '/invalid_prop_decorator_args.js',
  contents: `
  (function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
    typeof define === 'function' && define.amd ? define('invalid_prop_decorator_args', ['exports', '@angular/core'], factory) :
    (factory(global.invalid_prop_decorator_args, global.ng.core));
  }(this, (function (exports,core) { 'use strict';
  var NoArgsProperty = (function() {
    function NoArgsProperty() {
    }
    NoArgsProperty.propDecorators = {
      "prop": [{ type: core.Input },]
    };
    return NoArgsProperty;
  }());

  var args = [{ selector: '[ignored]' },];
  var NoPropertyAssignment = (function() {
    function NoPropertyAssignment() {
    }
    NoPropertyAssignment.propDecorators = {
      "prop": [{ type: core.Input, args },]
    };
    return NoPropertyAssignment;
  }());

  var NotArrayLiteral = (function() {
    function NotArrayLiteral() {
    }
    NotArrayLiteral.propDecorators = {
      "prop": [{ type: core.Input, args: () => [{ selector: '[ignored]' },] },],
    };
    return NotArrayLiteral;
  }());
})));`,
};

const INVALID_CTOR_DECORATORS_FILE = {
  name: '/invalid_ctor_decorators.js',
  contents: `
  (function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
    typeof define === 'function' && define.amd ? define('invalid_ctor_decorators', ['exports', '@angular/core'], factory) :
    (factory(global.invalid_ctor_decorators,global.ng.core));
  }(this, (function (exports,core) { 'use strict';
    var NoParameters = (function() {
    function NoParameters() {}
    return NoParameters;
  }());

  var ArrowFunction = (function() {
    function ArrowFunction(arg1) {
    }
    ArrowFunction.ctorParameters = () => [
      { type: 'ParamType', decorators: [{ type: core.Inject },] }
    ];
    return ArrowFunction;
  }());

  var NotArrayLiteral = (function() {
    function NotArrayLiteral(arg1) {
    }
    NotArrayLiteral.ctorParameters = function() { return 'StringsAreNotArrayLiterals'; };
    return NotArrayLiteral;
  }());

  var NotObjectLiteral = (function() {
    function NotObjectLiteral(arg1, arg2) {
    }
    NotObjectLiteral.ctorParameters = function() { return [
      "This is not an object literal",
      { type: 'ParamType', decorators: [{ type: core.Inject },] },
    ]; };
    return NotObjectLiteral;
  }());

  var NoTypeProperty = (function() {
    function NoTypeProperty(arg1, arg2) {
    }
    NoTypeProperty.ctorParameters = function() { return [
      {
        type: 'ParamType',
        decorators: [
          { notType: core.Inject },
          { type: core.Inject },
        ]
      },
    ]; };
    return NoTypeProperty;
  }());

  var NotIdentifier = (function() {
    function NotIdentifier(arg1, arg2) {
    }
    NotIdentifier.ctorParameters = function() { return [
      {
        type: 'ParamType',
        decorators: [
          { type: 'StringsLiteralsAreNotIdentifiers' },
          { type: core.Inject },
        ]
      },
    ]; };
    return NotIdentifier;
  }());
})));`,
};

const INVALID_CTOR_DECORATOR_ARGS_FILE = {
  name: '/invalid_ctor_decorator_args.js',
  contents: `
  (function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
    typeof define === 'function' && define.amd ? define('invalid_ctor_decorator_args', ['exports', '@angular/core'], factory) :
    (factory(global.invalid_ctor_decorator_args,global.ng.core));
  }(this, (function (exports,core) { 'use strict';
    var NoArgsProperty = (function() {
    function NoArgsProperty(arg1) {
    }
    NoArgsProperty.ctorParameters = function() { return [
      { type: 'ParamType', decorators: [{ type: core.Inject },] },
    ]; };
    return NoArgsProperty;
  }());

  var args = [{ selector: '[ignored]' },];
  var NoPropertyAssignment = (function() {
    function NoPropertyAssignment(arg1) {
    }
    NoPropertyAssignment.ctorParameters = function() { return [
      { type: 'ParamType', decorators: [{ type: core.Inject, args },] },
    ]; };
    return NoPropertyAssignment;
  }());

  var NotArrayLiteral = (function() {
    function NotArrayLiteral(arg1) {
    }
    NotArrayLiteral.ctorParameters = function() { return [
      { type: 'ParamType', decorators: [{ type: core.Inject, args: () => [{ selector: '[ignored]' },] },] },
    ]; };
    return NotArrayLiteral;
  }());
})));`,
};

const IMPORTS_FILES = [
  {
    name: '/file_a.js',
    contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define('file_a', ['exports'], factory) :
  (factory(global.file_a));
}(this, (function (exports) { 'use strict';
  var a = 'a';
  exports.a = a;
})));`,
  },
  {
    name: '/file_b.js',
    contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('./file_a')) :
  typeof define === 'function' && define.amd ? define('file_b', ['exports', './file_a'], factory) :
  (factory(global.file_b,global.file_a));
}(this, (function (exports, file_a) { 'use strict';
  var b = file_a.a;
  var c = 'c';
  var d = c;
})));`,
  },
  {
    name: '/file_c.js',
    contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('./file_a')) :
  typeof define === 'function' && define.amd ? define('file_c', ['exports', 'file_a'], factory) :
  (factory(global.file_c,global.file_a));
}(this, function (exports, file_a) { 'use strict';
  var c = file_a.a;
}));`,
  },
];

const EXPORTS_FILES = [
  {
    name: '/a_module.js',
    contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define('a_module', ['exports'], factory) :
  (factory(global.a_module));
}(this, (function (exports) { 'use strict';
  var a = 'a';
  exports.a = a;
})));`,
  },
  {
    name: '/b_module.js',
    contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core'), require('/a_module')) :
  typeof define === 'function' && define.amd ? define('b_module', ['exports', '@angular/core', 'a_module'], factory) :
  (factory(global.b_module));
}(this, (function (exports, core, a_module) { 'use strict';
  var b = a_module.a;
  var e = 'e';
  var SomeClass = (function() {
    function SomeClass() {}
    return SomeClass;
  }());

  exports.Directive = core.Directive;
  exports.a = a_module.a;
  exports.b = b;
  exports.c = a_module.a;
  exports.d = b;
  exports.e = e;
  exports.DirectiveX = core.Directive;
  exports.SomeClass = SomeClass;
})));`,
  },
];

const FUNCTION_BODY_FILE = {
  name: '/function_body.js',
  contents: `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define('function_body', ['exports'], factory) :
  (factory(global.function_body));
}(this, (function (exports) { 'use strict';
    function foo(x) {
    return x;
  }
  function bar(x, y) {
    if (y === void 0) { y = 42; }
    return x + y;
  }
  function complex() {
    var x = 42;
    return 42;
  }
  function baz(x) {
    var y;
    if (x === void 0) { y = 42; }
    return y;
  }
  var y;
  function qux(x) {
    if (x === void 0) { y = 42; }
    return y;
  }
  function moo() {
    var x;
    if (x === void 0) { x = 42; }
    return x;
  }
  var x;
  function juu() {
    if (x === void 0) { x = 42; }
    return x;
  }
})));`
};

const DECORATED_FILES = [
  {
    name: '/primary.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core'), require('./secondary')) :
      typeof define === 'function' && define.amd ? define('primary', ['exports', '@angular/core', './secondary'], factory) :
      (factory(global.primary,global.ng.core, global.secondary));
    }(this, (function (exports,core,secondary) { 'use strict';
    var A = (function() {
      function A() {}
      A.decorators = [
        { type: core.Directive, args: [{ selector: '[a]' }] }
      ];
      return A;
    }());
     var B = (function() {
      function B() {}
      B.decorators = [
        { type: core.Directive, args: [{ selector: '[b]' }] }
      ];
      return B;
    }());
     function x() {}
     function y() {}
     var C = (function() {
      function C() {}
      return C;
    });
    exports.A = A;
    exports.x = x;
    exports.C = C;
    })));`
  },
  {
    name: '/secondary.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core')) :
      typeof define === 'function' && define.amd ? define('primary', ['exports', '@angular/core'], factory) :
      (factory(global.primary,global.ng.core));
    }(this, (function (exports,core) { 'use strict';
    var D = (function() {
      function D() {}
      D.decorators = [
        { type: core.Directive, args: [{ selector: '[d]' }] }
      ];
      return D;
    }());
    exports.D = D;
  })));
    `
  }
];

const TYPINGS_SRC_FILES = [
  {
    name: '/src/index.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('./internal'), require('./class1'), require('./class2')) :
      typeof define === 'function' && define.amd ? define('index', ['exports', './internal', './class1', './class2'], factory) :
      (factory(global.index,global.internal,global.class1,global.class2));
    }(this, (function (exports,internal,class1,class2) { 'use strict';
      function __export(m) {
        for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
      }
      var InternalClass = internal.InternalClass;
      __export(class1);
      __export(class2);
    })));
    `
  },
  {
    name: '/src/class1.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define('class1', ['exports'], factory) :
      (factory(global.class1));
    }(this, (function (exports) { 'use strict';
      var Class1 = (function() {
        function Class1() {}
        return Class1;
      }());
      var MissingClass1 = (function() {
        function MissingClass1() {}
        return MissingClass1;
      }());
      exports.Class1 = Class1;
      exports.MissingClass1 = MissingClass1;
    })));
    `
  },
  {
    name: '/src/class2.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define('class2', ['exports'], factory) :
      (factory(global.class2));
    }(this, (function (exports) { 'use strict';
      var Class2 = (function() {
        function Class2() {}
        return Class2;
      }());
      exports.Class2 = Class2;
    })));
    `
  },
  {name: '/src/func1.js', contents: 'function mooFn() {} export {mooFn}'}, {
    name: '/src/internal.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define('internal', ['exports'], factory) :
      (factory(global.internal));
    }(this, (function (exports) { 'use strict';
      var InternalClass = (function() {
        function InternalClass() {}
        return InternalClass;
      }());
      var Class2 = (function() {
        function Class2() {}
        return Class2;
      }());
      exports.InternalClass =InternalClass;
      exports.Class2 = Class2;
    })));
    `
  },
  {
    name: '/src/missing-class.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define('missingClass', ['exports'], factory) :
      (factory(global.missingClass));
    }(this, (function (exports) { 'use strict';
      var MissingClass2 = (function() {
        function MissingClass2() {}
        return MissingClass2;
      }());
      exports. MissingClass2 = MissingClass2;
    })));
    `
  },
  {
    name: '/src/flat-file.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define('missingClass', ['exports'], factory) :
      (factory(global.missingClass));
    }(this, (function (exports) { 'use strict';
      var Class1 = (function() {
        function Class1() {}
        return Class1;
      }());
      var MissingClass1 = (function() {
        function MissingClass1() {}
        return MissingClass1;
      }());
      var MissingClass2 = (function() {
        function MissingClass2() {}
        return MissingClass2;
      }());
      var Class3 = (function() {
        function Class3() {}
        return Class3;
      }());
      exports.Class1 = Class1;
      exports.xClass3 = Class3;
      exports.MissingClass1 = MissingClass1;
      exports.MissingClass2 = MissingClass2;
    })));
    `
  }
];

const TYPINGS_DTS_FILES = [
  {
    name: '/typings/index.d.ts',
    contents:
        `import {InternalClass} from './internal'; export * from './class1'; export * from './class2';`
  },
  {
    name: '/typings/class1.d.ts',
    contents: `export declare class Class1 {}\nexport declare class OtherClass {}`
  },
  {
    name: '/typings/class2.d.ts',
    contents:
        `export declare class Class2 {}\nexport declare interface SomeInterface {}\nexport {Class3 as xClass3} from './class3';`
  },
  {name: '/typings/func1.d.ts', contents: 'export declare function mooFn(): void;'},
  {
    name: '/typings/internal.d.ts',
    contents: `export declare class InternalClass {}\nexport declare class Class2 {}`
  },
  {name: '/typings/class3.d.ts', contents: `export declare class Class3 {}`},
];

const MODULE_WITH_PROVIDERS_PROGRAM = [
  {
    name: '/src/functions.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('./module')) :
      typeof define === 'function' && define.amd ? define('functions', ['exports', './module'], factory) :
      (factory(global.functions,global.module));
    }(this, (function (exports,module) { 'use strict';
      var SomeService = (function() {
        function SomeService() {}
        return SomeService;
      }());

      var InternalModule = (function() {
        function InternalModule() {}
        return InternalModule;
      }());

      function aNumber() { return 42; }
      function aString() { return 'foo'; }
      function emptyObject() { return {}; }
      function ngModuleIdentifier() { return { ngModule: InternalModule }; }
      function ngModuleWithEmptyProviders() { return { ngModule: InternalModule, providers: [] }; }
      function ngModuleWithProviders() { return { ngModule: InternalModule, providers: [SomeService] }; }
      function onlyProviders() { return { providers: [SomeService] }; }
      function ngModuleNumber() { return { ngModule: 42 }; }
      function ngModuleString() { return { ngModule: 'foo' }; }
      function ngModuleObject() { return { ngModule: { foo: 42 } }; }
      function externalNgModule() { return { ngModule: module.ExternalModule }; }
      // NOTE: We do not include the "namespaced" export tests in UMD as all UMD exports are already namespaced.
      // function namespacedExternalNgModule() { return { ngModule: mod.ExternalModule }; }

      exports.aNumber = aNumber;
      exports.aString = aString;
      exports.emptyObject = emptyObject;
      exports.ngModuleIdentifier = ngModuleIdentifier;
      exports.ngModuleWithEmptyProviders = ngModuleWithEmptyProviders;
      exports.ngModuleWithProviders = ngModuleWithProviders;
      exports.onlyProviders = onlyProviders;
      exports.ngModuleNumber = ngModuleNumber;
      exports.ngModuleString = ngModuleString;
      exports.ngModuleObject = ngModuleObject;
      exports.externalNgModule = externalNgModule;
      exports.SomeService = SomeService;
      exports.InternalModule = InternalModule;
    })));
    `
  },
  {
    name: '/src/methods.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('./module')) :
      typeof define === 'function' && define.amd ? define('methods', ['exports', './module'], factory) :
      (factory(global.methods,global.module));
    }(this, (function (exports,module) { 'use strict';
      var SomeService = (function() {
        function SomeService() {}
        return SomeService;
      }());

      var InternalModule = (function() {
        function InternalModule() {}
        InternalModule.prototype = {
          instanceNgModuleIdentifier: function() { return { ngModule: InternalModule }; },
          instanceNgModuleWithEmptyProviders: function() { return { ngModule: InternalModule, providers: [] }; },
          instanceNgModuleWithProviders: function() { return { ngModule: InternalModule, providers: [SomeService] }; },
          instanceExternalNgModule: function() { return { ngModule: module.ExternalModule }; },
        };
        InternalModule.aNumber = function() { return 42; };
        InternalModule.aString = function() { return 'foo'; };
        InternalModule.emptyObject = function() { return {}; };
        InternalModule.ngModuleIdentifier = function() { return { ngModule: InternalModule }; };
        InternalModule.ngModuleWithEmptyProviders = function() { return { ngModule: InternalModule, providers: [] }; };
        InternalModule.ngModuleWithProviders = function() { return { ngModule: InternalModule, providers: [SomeService] }; };
        InternalModule.onlyProviders = function() { return { providers: [SomeService] }; };
        InternalModule.ngModuleNumber = function() { return { ngModule: 42 }; };
        InternalModule.ngModuleString = function() { return { ngModule: 'foo' }; };
        InternalModule.ngModuleObject = function() { return { ngModule: { foo: 42 } }; };
        InternalModule.externalNgModule = function() { return { ngModule: module.ExternalModule }; };
        return InternalModule;
      }());

      exports.SomeService = SomeService;
      exports.InternalModule = InternalModule;
    })));
    `
  },
  {
    name: '/src/aliased_class.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define('aliased_class', ['exports'], factory) :
      (factory(global.aliased_class));
    }(this, (function (exports,module) { 'use strict';
      var AliasedModule = (function() {
        function AliasedModule() {}
        AliasedModule_1 = AliasedModule;
        AliasedModule.forRoot = function() { return { ngModule: AliasedModule_1 }; };
        var AliasedModule_1;
        return AliasedModule;
      }());
      exports.AliasedModule = AliasedModule;
    })));
    `
  },
  {
    name: '/src/module.js',
    contents: `
    (function (global, factory) {
      typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
      typeof define === 'function' && define.amd ? define('module', ['exports'], factory) :
      (factory(global.module));
    }(this, (function (exports,module) { 'use strict';
      var ExternalModule = (function() {
        function ExternalModule() {}
        return ExternalModule;
      }());
      exports.ExternalModule = ExternalModule;
    })));
    `
  },
];


describe('UmdReflectionHost', () => {

  describe('getDecoratorsOfDeclaration()', () => {
    it('should find the decorators on a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode) !;

      expect(decorators).toBeDefined();
      expect(decorators.length).toEqual(1);

      const decorator = decorators[0];
      expect(decorator.name).toEqual('Directive');
      expect(decorator.import).toEqual({name: 'Directive', from: '@angular/core'});
      expect(decorator.args !.map(arg => arg.getText())).toEqual([
        '{ selector: \'[someDirective]\' }',
      ]);
    });

    it('should return null if the symbol is not a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([FOO_FUNCTION_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const functionNode =
          getDeclaration(program, FOO_FUNCTION_FILE.name, 'foo', isNamedFunctionDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(functionNode);
      expect(decorators).toBe(null);
    });

    it('should return null if there are no decorators', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_CLASS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode =
          getDeclaration(program, SIMPLE_CLASS_FILE.name, 'EmptyClass', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode);
      expect(decorators).toBe(null);
    });

    it('should ignore `decorators` if it is not an array literal', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_DECORATORS_FILE.name, 'NotArrayLiteral', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode);
      expect(decorators).toEqual([]);
    });

    it('should ignore decorator elements that are not object literals', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_DECORATORS_FILE.name, 'NotObjectLiteral', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode) !;

      expect(decorators.length).toBe(1);
      expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Directive'}));
    });

    it('should ignore decorator elements that have no `type` property', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_DECORATORS_FILE.name, 'NoTypeProperty', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode) !;

      expect(decorators.length).toBe(1);
      expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Directive'}));
    });

    it('should ignore decorator elements whose `type` value is not an identifier', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_DECORATORS_FILE.name, 'NotIdentifier', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode) !;

      expect(decorators.length).toBe(1);
      expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Directive'}));
    });

    it('should use `getImportOfIdentifier()` to retrieve import info', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const mockImportInfo: Import = {from: '@angular/core', name: 'Directive'};
      const spy = spyOn(host, 'getImportOfIdentifier').and.returnValue(mockImportInfo);

      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode) !;

      expect(decorators.length).toEqual(1);
      expect(decorators[0].import).toBe(mockImportInfo);

      const typeIdentifier = spy.calls.mostRecent().args[0] as ts.Identifier;
      expect(typeIdentifier.text).toBe('Directive');
    });

    describe('(returned decorators `args`)', () => {
      it('should be an empty array if decorator has no `args` property', () => {
        const {program, host: compilerHost} = makeTestBundleProgram([INVALID_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_DECORATOR_ARGS_FILE.name, 'NoArgsProperty',
            isNamedVariableDeclaration);
        const decorators = host.getDecoratorsOfDeclaration(classNode) !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Directive');
        expect(decorators[0].args).toEqual([]);
      });

      it('should be an empty array if decorator\'s `args` has no property assignment', () => {
        const {program, host: compilerHost} = makeTestBundleProgram([INVALID_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_DECORATOR_ARGS_FILE.name, 'NoPropertyAssignment',
            isNamedVariableDeclaration);
        const decorators = host.getDecoratorsOfDeclaration(classNode) !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Directive');
        expect(decorators[0].args).toEqual([]);
      });

      it('should be an empty array if `args` property value is not an array literal', () => {
        const {program, host: compilerHost} = makeTestBundleProgram([INVALID_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_DECORATOR_ARGS_FILE.name, 'NotArrayLiteral',
            isNamedVariableDeclaration);
        const decorators = host.getDecoratorsOfDeclaration(classNode) !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Directive');
        expect(decorators[0].args).toEqual([]);
      });
    });
  });

  describe('getMembersOfClass()', () => {
    it('should find decorated members on a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);

      const input1 = members.find(member => member.name === 'input1') !;
      expect(input1.kind).toEqual(ClassMemberKind.Property);
      expect(input1.isStatic).toEqual(false);
      expect(input1.decorators !.map(d => d.name)).toEqual(['Input']);

      const input2 = members.find(member => member.name === 'input2') !;
      expect(input2.kind).toEqual(ClassMemberKind.Property);
      expect(input2.isStatic).toEqual(false);
      expect(input1.decorators !.map(d => d.name)).toEqual(['Input']);
    });

    it('should find non decorated properties on a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);

      const instanceProperty = members.find(member => member.name === 'instanceProperty') !;
      expect(instanceProperty.kind).toEqual(ClassMemberKind.Property);
      expect(instanceProperty.isStatic).toEqual(false);
      expect(ts.isBinaryExpression(instanceProperty.implementation !)).toEqual(true);
      expect(instanceProperty.value !.getText()).toEqual(`'instance'`);
    });

    it('should find static methods on a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);

      const staticMethod = members.find(member => member.name === 'staticMethod') !;
      expect(staticMethod.kind).toEqual(ClassMemberKind.Method);
      expect(staticMethod.isStatic).toEqual(true);
      expect(ts.isFunctionExpression(staticMethod.implementation !)).toEqual(true);
    });

    it('should find static properties on a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);

      const staticProperty = members.find(member => member.name === 'staticProperty') !;
      expect(staticProperty.kind).toEqual(ClassMemberKind.Property);
      expect(staticProperty.isStatic).toEqual(true);
      expect(ts.isPropertyAccessExpression(staticProperty.implementation !)).toEqual(true);
      expect(staticProperty.value !.getText()).toEqual(`'static'`);
    });

    it('should throw if the symbol is not a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([FOO_FUNCTION_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const functionNode =
          getDeclaration(program, FOO_FUNCTION_FILE.name, 'foo', isNamedFunctionDeclaration);
      expect(() => {
        host.getMembersOfClass(functionNode);
      }).toThrowError(`Attempted to get members of a non-class: "function foo() {}"`);
    });

    it('should return an empty array if there are no prop decorators', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_CLASS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode =
          getDeclaration(program, SIMPLE_CLASS_FILE.name, 'EmptyClass', isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);

      expect(members).toEqual([]);
    });

    it('should not process decorated properties in `propDecorators` if it is not an object literal',
       () => {
         const {program, host: compilerHost} =
             makeTestBundleProgram([INVALID_PROP_DECORATORS_FILE]);
         const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
         const classNode = getDeclaration(
             program, INVALID_PROP_DECORATORS_FILE.name, 'NotObjectLiteral',
             isNamedVariableDeclaration);
         const members = host.getMembersOfClass(classNode);

         expect(members.map(member => member.name)).not.toContain('prop');
       });

    it('should ignore prop decorator elements that are not object literals', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_PROP_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_PROP_DECORATORS_FILE.name, 'NotObjectLiteralProp',
          isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);
      const prop = members.find(m => m.name === 'prop') !;
      const decorators = prop.decorators !;

      expect(decorators.length).toBe(1);
      expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Directive'}));
    });

    it('should ignore prop decorator elements that have no `type` property', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_PROP_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_PROP_DECORATORS_FILE.name, 'NoTypeProperty', isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);
      const prop = members.find(m => m.name === 'prop') !;
      const decorators = prop.decorators !;

      expect(decorators.length).toBe(1);
      expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Directive'}));
    });

    it('should ignore prop decorator elements whose `type` value is not an identifier', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_PROP_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_PROP_DECORATORS_FILE.name, 'NotIdentifier', isNamedVariableDeclaration);
      const members = host.getMembersOfClass(classNode);
      const prop = members.find(m => m.name === 'prop') !;
      const decorators = prop.decorators !;

      expect(decorators.length).toBe(1);
      expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Directive'}));
    });

    it('should use `getImportOfIdentifier()` to retrieve import info', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const mockImportInfo = { name: 'mock', from: '@angular/core' } as Import;
      const spy = spyOn(host, 'getImportOfIdentifier').and.returnValue(mockImportInfo);

      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const decorators = host.getDecoratorsOfDeclaration(classNode) !;

      expect(decorators.length).toEqual(1);
      expect(decorators[0].import).toBe(mockImportInfo);

      const typeIdentifier = spy.calls.mostRecent().args[0] as ts.Identifier;
      expect(typeIdentifier.text).toBe('Directive');
    });

    describe('(returned prop decorators `args`)', () => {
      it('should be an empty array if prop decorator has no `args` property', () => {
        const {program, host: compilerHost} =
            makeTestBundleProgram([INVALID_PROP_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_PROP_DECORATOR_ARGS_FILE.name, 'NoArgsProperty',
            isNamedVariableDeclaration);
        const members = host.getMembersOfClass(classNode);
        const prop = members.find(m => m.name === 'prop') !;
        const decorators = prop.decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Input');
        expect(decorators[0].args).toEqual([]);
      });

      it('should be an empty array if prop decorator\'s `args` has no property assignment', () => {
        const {program, host: compilerHost} =
            makeTestBundleProgram([INVALID_PROP_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_PROP_DECORATOR_ARGS_FILE.name, 'NoPropertyAssignment',
            isNamedVariableDeclaration);
        const members = host.getMembersOfClass(classNode);
        const prop = members.find(m => m.name === 'prop') !;
        const decorators = prop.decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Input');
        expect(decorators[0].args).toEqual([]);
      });

      it('should be an empty array if `args` property value is not an array literal', () => {
        const {program, host: compilerHost} =
            makeTestBundleProgram([INVALID_PROP_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_PROP_DECORATOR_ARGS_FILE.name, 'NotArrayLiteral',
            isNamedVariableDeclaration);
        const members = host.getMembersOfClass(classNode);
        const prop = members.find(m => m.name === 'prop') !;
        const decorators = prop.decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Input');
        expect(decorators[0].args).toEqual([]);
      });
    });
  });

  describe('getConstructorParameters', () => {
    it('should find the decorated constructor parameters', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const parameters = host.getConstructorParameters(classNode);

      expect(parameters).toBeDefined();
      expect(parameters !.map(parameter => parameter.name)).toEqual([
        '_viewContainer', '_template', 'injected'
      ]);
      expectTypeValueReferencesForParameters(parameters !, [
        'ViewContainerRef',
        'TemplateRef',
        null,
      ]);
    });

    it('should throw if the symbol is not a class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([FOO_FUNCTION_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const functionNode =
          getDeclaration(program, FOO_FUNCTION_FILE.name, 'foo', isNamedFunctionDeclaration);
      expect(() => { host.getConstructorParameters(functionNode); })
          .toThrowError(
              'Attempted to get constructor parameters of a non-class: "function foo() {}"');
    });

    // In ES5 there is no such thing as a constructor-less class
    // it('should return `null` if there is no constructor', () => { });

    it('should return an array even if there are no decorators', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_CLASS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SIMPLE_CLASS_FILE.name, 'NoDecoratorConstructorClass',
          isNamedVariableDeclaration);
      const parameters = host.getConstructorParameters(classNode);

      expect(parameters).toEqual(jasmine.any(Array));
      expect(parameters !.length).toEqual(1);
      expect(parameters ![0].name).toEqual('foo');
      expect(parameters ![0].decorators).toBe(null);
    });

    it('should return an empty array if there are no constructor parameters', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_CTOR_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_CTOR_DECORATORS_FILE.name, 'NoParameters', isNamedVariableDeclaration);
      const parameters = host.getConstructorParameters(classNode);

      expect(parameters).toEqual([]);
    });

    // In ES5 there are no arrow functions
    // it('should ignore `ctorParameters` if it is an arrow function', () => { });

    it('should ignore `ctorParameters` if it does not return an array literal', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([INVALID_CTOR_DECORATORS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, INVALID_CTOR_DECORATORS_FILE.name, 'NotArrayLiteral',
          isNamedVariableDeclaration);
      const parameters = host.getConstructorParameters(classNode);

      expect(parameters !.length).toBe(1);
      expect(parameters ![0]).toEqual(jasmine.objectContaining<CtorParameter>({
        name: 'arg1',
        decorators: null,
      }));
    });

    describe('(returned parameters `decorators`)', () => {
      it('should ignore param decorator elements that are not object literals', () => {
        const {program, host: compilerHost} = makeTestBundleProgram([INVALID_CTOR_DECORATORS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_CTOR_DECORATORS_FILE.name, 'NotObjectLiteral',
            isNamedVariableDeclaration);
        const parameters = host.getConstructorParameters(classNode);

        expect(parameters !.length).toBe(2);
        expect(parameters ![0]).toEqual(jasmine.objectContaining<CtorParameter>({
          name: 'arg1',
          decorators: null,
        }));
        expect(parameters ![1]).toEqual(jasmine.objectContaining<CtorParameter>({
          name: 'arg2',
          decorators: jasmine.any(Array) as any
        }));
      });

      it('should ignore param decorator elements that have no `type` property', () => {
        const {program, host: compilerHost} = makeTestBundleProgram([INVALID_CTOR_DECORATORS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_CTOR_DECORATORS_FILE.name, 'NoTypeProperty',
            isNamedVariableDeclaration);
        const parameters = host.getConstructorParameters(classNode);
        const decorators = parameters ![0].decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Inject'}));
      });

      it('should ignore param decorator elements whose `type` value is not an identifier', () => {
        const {program, host: compilerHost} = makeTestBundleProgram([INVALID_CTOR_DECORATORS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_CTOR_DECORATORS_FILE.name, 'NotIdentifier',
            isNamedVariableDeclaration);
        const parameters = host.getConstructorParameters(classNode);
        const decorators = parameters ![0].decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0]).toEqual(jasmine.objectContaining({name: 'Inject'}));
      });

      it('should use `getImportOfIdentifier()` to retrieve import info', () => {
        const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
        const mockImportInfo: Import = {from: '@angular/core', name: 'Directive'};
        const spy = spyOn(UmdReflectionHost.prototype, 'getImportOfIdentifier')
                        .and.returnValue(mockImportInfo);

        const parameters = host.getConstructorParameters(classNode);
        const decorators = parameters ![2].decorators !;

        expect(decorators.length).toEqual(1);
        expect(decorators[0].import).toBe(mockImportInfo);

        const typeIdentifier = spy.calls.mostRecent().args[0] as ts.Identifier;
        expect(typeIdentifier.text).toBe('Inject');
      });
    });

    describe('(returned parameters `decorators.args`)', () => {
      it('should be an empty array if param decorator has no `args` property', () => {
        const {program, host: compilerHost} =
            makeTestBundleProgram([INVALID_CTOR_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_CTOR_DECORATOR_ARGS_FILE.name, 'NoArgsProperty',
            isNamedVariableDeclaration);
        const parameters = host.getConstructorParameters(classNode);
        expect(parameters !.length).toBe(1);
        const decorators = parameters ![0].decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Inject');
        expect(decorators[0].args).toEqual([]);
      });

      it('should be an empty array if param decorator\'s `args` has no property assignment', () => {
        const {program, host: compilerHost} =
            makeTestBundleProgram([INVALID_CTOR_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_CTOR_DECORATOR_ARGS_FILE.name, 'NoPropertyAssignment',
            isNamedVariableDeclaration);
        const parameters = host.getConstructorParameters(classNode);
        const decorators = parameters ![0].decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Inject');
        expect(decorators[0].args).toEqual([]);
      });

      it('should be an empty array if `args` property value is not an array literal', () => {
        const {program, host: compilerHost} =
            makeTestBundleProgram([INVALID_CTOR_DECORATOR_ARGS_FILE]);
        const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
        const classNode = getDeclaration(
            program, INVALID_CTOR_DECORATOR_ARGS_FILE.name, 'NotArrayLiteral',
            isNamedVariableDeclaration);
        const parameters = host.getConstructorParameters(classNode);
        const decorators = parameters ![0].decorators !;

        expect(decorators.length).toBe(1);
        expect(decorators[0].name).toBe('Inject');
        expect(decorators[0].args).toEqual([]);
      });
    });
  });

  describe('getDefinitionOfFunction()', () => {
    it('should return an object describing the function declaration passed as an argument', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([FUNCTION_BODY_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);

      const fooNode =
          getDeclaration(program, FUNCTION_BODY_FILE.name, 'foo', isNamedFunctionDeclaration) !;
      const fooDef = host.getDefinitionOfFunction(fooNode);
      expect(fooDef.node).toBe(fooNode);
      expect(fooDef.body !.length).toEqual(1);
      expect(fooDef.body ![0].getText()).toEqual(`return x;`);
      expect(fooDef.parameters.length).toEqual(1);
      expect(fooDef.parameters[0].name).toEqual('x');
      expect(fooDef.parameters[0].initializer).toBe(null);

      const barNode =
          getDeclaration(program, FUNCTION_BODY_FILE.name, 'bar', isNamedFunctionDeclaration) !;
      const barDef = host.getDefinitionOfFunction(barNode);
      expect(barDef.node).toBe(barNode);
      expect(barDef.body !.length).toEqual(1);
      expect(ts.isReturnStatement(barDef.body ![0])).toBeTruthy();
      expect(barDef.body ![0].getText()).toEqual(`return x + y;`);
      expect(barDef.parameters.length).toEqual(2);
      expect(barDef.parameters[0].name).toEqual('x');
      expect(fooDef.parameters[0].initializer).toBe(null);
      expect(barDef.parameters[1].name).toEqual('y');
      expect(barDef.parameters[1].initializer !.getText()).toEqual('42');

      const bazNode =
          getDeclaration(program, FUNCTION_BODY_FILE.name, 'baz', isNamedFunctionDeclaration) !;
      const bazDef = host.getDefinitionOfFunction(bazNode);
      expect(bazDef.node).toBe(bazNode);
      expect(bazDef.body !.length).toEqual(3);
      expect(bazDef.parameters.length).toEqual(1);
      expect(bazDef.parameters[0].name).toEqual('x');
      expect(bazDef.parameters[0].initializer).toBe(null);

      const quxNode =
          getDeclaration(program, FUNCTION_BODY_FILE.name, 'qux', isNamedFunctionDeclaration) !;
      const quxDef = host.getDefinitionOfFunction(quxNode);
      expect(quxDef.node).toBe(quxNode);
      expect(quxDef.body !.length).toEqual(2);
      expect(quxDef.parameters.length).toEqual(1);
      expect(quxDef.parameters[0].name).toEqual('x');
      expect(quxDef.parameters[0].initializer).toBe(null);
    });
  });

  describe('getImportOfIdentifier', () => {
    it('should find the import of an identifier', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(IMPORTS_FILES);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const variableNode = getDeclaration(program, '/file_b.js', 'b', isNamedVariableDeclaration);
      const identifier =
          (variableNode.initializer && ts.isPropertyAccessExpression(variableNode.initializer)) ?
          variableNode.initializer.name :
          null;

      expect(identifier).not.toBe(null);
      const importOfIdent = host.getImportOfIdentifier(identifier !);
      expect(importOfIdent).toEqual({name: 'a', from: './file_a'});
    });

    it('should return null if the identifier was not imported', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(IMPORTS_FILES);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const variableNode = getDeclaration(program, '/file_b.js', 'd', isNamedVariableDeclaration);
      const importOfIdent = host.getImportOfIdentifier(variableNode.initializer as ts.Identifier);

      expect(importOfIdent).toBeNull();
    });

    it('should handle factory functions not wrapped in parentheses', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(IMPORTS_FILES);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const variableNode = getDeclaration(program, '/file_c.js', 'c', isNamedVariableDeclaration);
      const identifier =
          (variableNode.initializer && ts.isPropertyAccessExpression(variableNode.initializer)) ?
          variableNode.initializer.name :
          null;

      expect(identifier).not.toBe(null);
      const importOfIdent = host.getImportOfIdentifier(identifier !);
      expect(importOfIdent).toEqual({name: 'a', from: './file_a'});
    });
  });

  describe('getDeclarationOfIdentifier', () => {
    it('should return the declaration of a locally defined identifier', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const ctrDecorators = host.getConstructorParameters(classNode) !;
      const identifierOfViewContainerRef = (ctrDecorators[0].typeValueReference !as{
                                             local: true,
                                             expression: ts.Identifier,
                                             defaultImportStatement: null,
                                           }).expression;

      const expectedDeclarationNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'ViewContainerRef', isNamedVariableDeclaration);
      const actualDeclaration = host.getDeclarationOfIdentifier(identifierOfViewContainerRef);
      expect(actualDeclaration).not.toBe(null);
      expect(actualDeclaration !.node).toBe(expectedDeclarationNode);
      expect(actualDeclaration !.viaModule).toBe(null);
    });

    it('should return the source-file of an import namespace', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SOME_DIRECTIVE_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(
          program, SOME_DIRECTIVE_FILE.name, 'SomeDirective', isNamedVariableDeclaration);
      const classDecorators = host.getDecoratorsOfDeclaration(classNode) !;
      const identifierOfDirective = (((classDecorators[0].node as ts.ObjectLiteralExpression)
                                          .properties[0] as ts.PropertyAssignment)
                                         .initializer as ts.PropertyAccessExpression)
                                        .expression as ts.Identifier;

      const expectedDeclarationNode =
          program.getSourceFile('node_modules/@angular/core/index.d.ts') !;
      const actualDeclaration = host.getDeclarationOfIdentifier(identifierOfDirective);
      expect(actualDeclaration).not.toBe(null);
      expect(actualDeclaration !.node).toBe(expectedDeclarationNode);
      expect(actualDeclaration !.viaModule).toBe('@angular/core');
    });
  });

  describe('getExportsOfModule()', () => {
    it('should return a map of all the exports from a given module', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(EXPORTS_FILES);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const file = program.getSourceFile(EXPORTS_FILES[1].name) !;
      const exportDeclarations = host.getExportsOfModule(file);
      expect(exportDeclarations).not.toBe(null);
      expect(Array.from(exportDeclarations !.entries())
                 .map(entry => [entry[0], entry[1].node.getText(), entry[1].viaModule]))
          .toEqual([
            ['Directive', `Directive: FnWithArg<(clazz: any) => any>`, '@angular/core'],
            ['a', `a = 'a'`, '/a_module'],
            ['b', `b = a_module.a`, null],
            ['c', `a = 'a'`, '/a_module'],
            ['d', `b = a_module.a`, null],
            ['e', `e = 'e'`, null],
            ['DirectiveX', `Directive: FnWithArg<(clazz: any) => any>`, '@angular/core'],
            [
              'SomeClass', `SomeClass = (function() {
    function SomeClass() {}
    return SomeClass;
  }())`,
              null
            ],
          ]);
    });

    // Currently we do not support UMD versions of `export * from 'x';`
    // because it gets compiled to something like:
    //
    //     __export(m) {
    //       for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
    //     }
    //     __export(x);
    //
    // So far all UMD formatted entry-points are flat so this should not occur.
    // If it does later then we should implement parsing.
  });

  describe('getClassSymbol()', () => {
    it('should return the class symbol for an ES2015 class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_ES2015_CLASS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const node = getDeclaration(
          program, SIMPLE_ES2015_CLASS_FILE.name, 'EmptyClass', isNamedClassDeclaration);
      const classSymbol = host.getClassSymbol(node);

      expect(classSymbol).toBeDefined();
      expect(classSymbol !.valueDeclaration).toBe(node);
    });

    it('should return the class symbol for an ES5 class (outer variable declaration)', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_CLASS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const node =
          getDeclaration(program, SIMPLE_CLASS_FILE.name, 'EmptyClass', isNamedVariableDeclaration);
      const classSymbol = host.getClassSymbol(node);

      expect(classSymbol).toBeDefined();
      expect(classSymbol !.valueDeclaration).toBe(node);
    });

    it('should return the class symbol for an ES5 class (inner function declaration)', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_CLASS_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const outerNode =
          getDeclaration(program, SIMPLE_CLASS_FILE.name, 'EmptyClass', isNamedVariableDeclaration);
      const innerNode = getIifeBody(outerNode) !.statements.find(isNamedFunctionDeclaration) !;
      const classSymbol = host.getClassSymbol(innerNode);

      expect(classSymbol).toBeDefined();
      expect(classSymbol !.valueDeclaration).toBe(outerNode);
    });

    it('should return the same class symbol (of the outer declaration) for outer and inner declarations',
       () => {
         const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_CLASS_FILE]);
         const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
         const outerNode = getDeclaration(
             program, SIMPLE_CLASS_FILE.name, 'EmptyClass', isNamedVariableDeclaration);
         const innerNode = getIifeBody(outerNode) !.statements.find(isNamedFunctionDeclaration) !;

         expect(host.getClassSymbol(innerNode)).toBe(host.getClassSymbol(outerNode));
       });

    it('should return undefined if node is not an ES5 class', () => {
      const {program, host: compilerHost} = makeTestBundleProgram([FOO_FUNCTION_FILE]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const node =
          getDeclaration(program, FOO_FUNCTION_FILE.name, 'foo', isNamedFunctionDeclaration);
      const classSymbol = host.getClassSymbol(node);

      expect(classSymbol).toBeUndefined();
    });
  });

  describe('isClass()', () => {
    let host: UmdReflectionHost;
    let mockNode: ts.Node;
    let getClassDeclarationSpy: jasmine.Spy;
    let superGetClassDeclarationSpy: jasmine.Spy;

    beforeEach(() => {
      const {program, host: compilerHost} = makeTestBundleProgram([SIMPLE_CLASS_FILE]);
      host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      mockNode = {} as any;

      getClassDeclarationSpy = spyOn(UmdReflectionHost.prototype, 'getClassDeclaration');
      superGetClassDeclarationSpy = spyOn(Esm2015ReflectionHost.prototype, 'getClassDeclaration');
    });

    it('should return true if superclass returns true', () => {
      superGetClassDeclarationSpy.and.returnValue(true);
      getClassDeclarationSpy.and.callThrough();

      expect(host.isClass(mockNode)).toBe(true);
      expect(getClassDeclarationSpy).toHaveBeenCalledWith(mockNode);
      expect(superGetClassDeclarationSpy).toHaveBeenCalledWith(mockNode);
    });

    it('should return true if it can find a declaration for the class', () => {
      getClassDeclarationSpy.and.returnValue(true);

      expect(host.isClass(mockNode)).toBe(true);
      expect(getClassDeclarationSpy).toHaveBeenCalledWith(mockNode);
    });

    it('should return false if it cannot find a declaration for the class', () => {
      getClassDeclarationSpy.and.returnValue(false);

      expect(host.isClass(mockNode)).toBe(false);
      expect(getClassDeclarationSpy).toHaveBeenCalledWith(mockNode);
    });
  });

  describe('hasBaseClass()', () => {
    function hasBaseClass(source: string) {
      const file = {
        name: '/synthesized_constructors.js',
        contents: source,
      };

      const {program, host: compilerHost} = makeTestBundleProgram([file]);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const classNode = getDeclaration(program, file.name, 'TestClass', isNamedVariableDeclaration);
      return host.hasBaseClass(classNode);
    }

    it('should consider an IIFE with _super parameter as having a base class', () => {
      const result = hasBaseClass(`
        var TestClass = /** @class */ (function (_super) {
          __extends(TestClass, _super);
          function TestClass() {}
          return TestClass;
        }(null));`);
      expect(result).toBe(true);
    });

    it('should consider an IIFE with a unique name generated for the _super parameter as having a base class',
       () => {
         const result = hasBaseClass(`
        var TestClass = /** @class */ (function (_super_1) {
          __extends(TestClass, _super_1);
          function TestClass() {}
          return TestClass;
        }(null));`);
         expect(result).toBe(true);
       });

    it('should not consider an IIFE without parameter as having a base class', () => {
      const result = hasBaseClass(`
        var TestClass = /** @class */ (function () {
          __extends(TestClass, _super);
          function TestClass() {}
          return TestClass;
        }(null));`);
      expect(result).toBe(false);
    });
  });

  describe('findDecoratedClasses()', () => {
    it('should return an array of all decorated classes in the given source file', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(DECORATED_FILES);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const primary = program.getSourceFile(DECORATED_FILES[0].name) !;

      const primaryDecoratedClasses = host.findDecoratedClasses(primary);
      expect(primaryDecoratedClasses.length).toEqual(2);
      const classA = primaryDecoratedClasses.find(c => c.name === 'A') !;
      expect(classA.decorators.map(decorator => decorator.name)).toEqual(['Directive']);
      // Note that `B` is not exported from `primary.js`
      const classB = primaryDecoratedClasses.find(c => c.name === 'B') !;
      expect(classB.decorators.map(decorator => decorator.name)).toEqual(['Directive']);

      const secondary = program.getSourceFile(DECORATED_FILES[1].name) !;
      const secondaryDecoratedClasses = host.findDecoratedClasses(secondary);
      expect(secondaryDecoratedClasses.length).toEqual(1);
      // Note that `D` is exported from `secondary.js` but not exported from `primary.js`
      const classD = secondaryDecoratedClasses.find(c => c.name === 'D') !;
      expect(classD.name).toEqual('D');
      expect(classD.decorators.map(decorator => decorator.name)).toEqual(['Directive']);
    });
  });

  describe('getDtsDeclarationsOfClass()', () => {
    it('should find the dts declaration that has the same relative path to the source file', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
      const dts = makeTestBundleProgram(TYPINGS_DTS_FILES);
      const class1 = getDeclaration(program, '/src/class1.js', 'Class1', ts.isVariableDeclaration);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dts);

      const dtsDeclaration = host.getDtsDeclaration(class1);
      expect(dtsDeclaration !.getSourceFile().fileName).toEqual('/typings/class1.d.ts');
    });

    it('should find the dts declaration for exported functions', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
      const dtsProgram = makeTestBundleProgram(TYPINGS_DTS_FILES);
      const mooFn = getDeclaration(program, '/src/func1.js', 'mooFn', ts.isFunctionDeclaration);
      const host =
          new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dtsProgram);

      const dtsDeclaration = host.getDtsDeclaration(mooFn);
      expect(dtsDeclaration !.getSourceFile().fileName).toEqual('/typings/func1.d.ts');
    });

    it('should return null if there is no matching class in the matching dts file', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
      const dts = makeTestBundleProgram(TYPINGS_DTS_FILES);
      const missingClass =
          getDeclaration(program, '/src/class1.js', 'MissingClass1', ts.isVariableDeclaration);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dts);

      expect(host.getDtsDeclaration(missingClass)).toBe(null);
    });

    it('should return null if there is no matching dts file', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
      const dts = makeTestBundleProgram(TYPINGS_DTS_FILES);
      const missingClass = getDeclaration(
          program, '/src/missing-class.js', 'MissingClass2', ts.isVariableDeclaration);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dts);

      expect(host.getDtsDeclaration(missingClass)).toBe(null);
    });

    it('should find the dts file that contains a matching class declaration, even if the source files do not match',
       () => {
         const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
         const dts = makeTestBundleProgram(TYPINGS_DTS_FILES);
         const class1 =
             getDeclaration(program, '/src/flat-file.js', 'Class1', ts.isVariableDeclaration);
         const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dts);

         const dtsDeclaration = host.getDtsDeclaration(class1);
         expect(dtsDeclaration !.getSourceFile().fileName).toEqual('/typings/class1.d.ts');
       });

    it('should find aliased exports', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
      const dts = makeTestBundleProgram(TYPINGS_DTS_FILES);
      const class3 =
          getDeclaration(program, '/src/flat-file.js', 'Class3', ts.isVariableDeclaration);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dts);

      const dtsDeclaration = host.getDtsDeclaration(class3);
      expect(dtsDeclaration !.getSourceFile().fileName).toEqual('/typings/class3.d.ts');
    });

    it('should find the dts file that contains a matching class declaration, even if the class is not publicly exported',
       () => {
         const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
         const dts = makeTestBundleProgram(TYPINGS_DTS_FILES);
         const internalClass =
             getDeclaration(program, '/src/internal.js', 'InternalClass', ts.isVariableDeclaration);
         const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dts);

         const dtsDeclaration = host.getDtsDeclaration(internalClass);
         expect(dtsDeclaration !.getSourceFile().fileName).toEqual('/typings/internal.d.ts');
       });

    it('should prefer the publicly exported class if there are multiple classes with the same name',
       () => {
         const {program, host: compilerHost} = makeTestBundleProgram(TYPINGS_SRC_FILES);
         const dts = makeTestBundleProgram(TYPINGS_DTS_FILES);
         const class2 =
             getDeclaration(program, '/src/class2.js', 'Class2', ts.isVariableDeclaration);
         const internalClass2 =
             getDeclaration(program, '/src/internal.js', 'Class2', ts.isVariableDeclaration);
         const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost, dts);

         const class2DtsDeclaration = host.getDtsDeclaration(class2);
         expect(class2DtsDeclaration !.getSourceFile().fileName).toEqual('/typings/class2.d.ts');

         const internalClass2DtsDeclaration = host.getDtsDeclaration(internalClass2);
         expect(internalClass2DtsDeclaration !.getSourceFile().fileName)
             .toEqual('/typings/class2.d.ts');
       });
  });

  describe('getModuleWithProvidersFunctions', () => {
    it('should find every exported function that returns an object that looks like a ModuleWithProviders object',
       () => {
         const {program, host: compilerHost} = makeTestBundleProgram(MODULE_WITH_PROVIDERS_PROGRAM);
         const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
         const file = program.getSourceFile('/src/functions.js') !;
         const fns = host.getModuleWithProvidersFunctions(file);
         expect(fns.map(fn => [fn.declaration.name !.getText(), fn.ngModule.node.name.text]))
             .toEqual([
               ['ngModuleIdentifier', 'InternalModule'],
               ['ngModuleWithEmptyProviders', 'InternalModule'],
               ['ngModuleWithProviders', 'InternalModule'],
               ['externalNgModule', 'ExternalModule'],
             ]);
       });

    it('should find every static method on exported classes that return an object that looks like a ModuleWithProviders object',
       () => {
         const {program, host: compilerHost} = makeTestBundleProgram(MODULE_WITH_PROVIDERS_PROGRAM);
         const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
         const file = program.getSourceFile('/src/methods.js') !;
         const fn = host.getModuleWithProvidersFunctions(file);
         expect(fn.map(fn => [fn.declaration.getText(), fn.ngModule.node.name.text])).toEqual([
           [
             'function() { return { ngModule: InternalModule }; }',
             'InternalModule',
           ],
           [
             'function() { return { ngModule: InternalModule, providers: [] }; }',
             'InternalModule',
           ],
           [
             'function() { return { ngModule: InternalModule, providers: [SomeService] }; }',
             'InternalModule',
           ],
           [
             'function() { return { ngModule: module.ExternalModule }; }',
             'ExternalModule',
           ],
         ]);
       });

    // https://github.com/angular/angular/issues/29078
    it('should resolve aliased module references to their original declaration', () => {
      const {program, host: compilerHost} = makeTestBundleProgram(MODULE_WITH_PROVIDERS_PROGRAM);
      const host = new UmdReflectionHost(new MockLogger(), false, program, compilerHost);
      const file = program.getSourceFile('/src/aliased_class.js') !;
      const fn = host.getModuleWithProvidersFunctions(file);
      expect(fn.map(fn => [fn.declaration.getText(), fn.ngModule.node.name.text])).toEqual([
        ['function() { return { ngModule: AliasedModule_1 }; }', 'AliasedModule'],
      ]);
    });
  });
});
