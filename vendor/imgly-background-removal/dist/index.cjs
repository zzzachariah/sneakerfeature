"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../node_modules/iota-array/iota.js
var require_iota = __commonJS({
  "../../node_modules/iota-array/iota.js"(exports, module2) {
    "use strict";
    function iota(n) {
      var result = new Array(n);
      for (var i = 0; i < n; ++i) {
        result[i] = i;
      }
      return result;
    }
    module2.exports = iota;
  }
});

// ../../node_modules/is-buffer/index.js
var require_is_buffer = __commonJS({
  "../../node_modules/is-buffer/index.js"(exports, module2) {
    module2.exports = function(obj) {
      return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer);
    };
    function isBuffer(obj) {
      return !!obj.constructor && typeof obj.constructor.isBuffer === "function" && obj.constructor.isBuffer(obj);
    }
    function isSlowBuffer(obj) {
      return typeof obj.readFloatLE === "function" && typeof obj.slice === "function" && isBuffer(obj.slice(0, 0));
    }
  }
});

// ../../node_modules/ndarray/ndarray.js
var require_ndarray = __commonJS({
  "../../node_modules/ndarray/ndarray.js"(exports, module2) {
    var iota = require_iota();
    var isBuffer = require_is_buffer();
    var hasTypedArrays = typeof Float64Array !== "undefined";
    function compare1st(a, b) {
      return a[0] - b[0];
    }
    function order() {
      var stride = this.stride;
      var terms = new Array(stride.length);
      var i;
      for (i = 0; i < terms.length; ++i) {
        terms[i] = [Math.abs(stride[i]), i];
      }
      terms.sort(compare1st);
      var result = new Array(terms.length);
      for (i = 0; i < result.length; ++i) {
        result[i] = terms[i][1];
      }
      return result;
    }
    function compileConstructor(dtype, dimension) {
      var className = ["View", dimension, "d", dtype].join("");
      if (dimension < 0) {
        className = "View_Nil" + dtype;
      }
      var useGetters = dtype === "generic";
      if (dimension === -1) {
        var code = "function " + className + "(a){this.data=a;};var proto=" + className + ".prototype;proto.dtype='" + dtype + "';proto.index=function(){return -1};proto.size=0;proto.dimension=-1;proto.shape=proto.stride=proto.order=[];proto.lo=proto.hi=proto.transpose=proto.step=function(){return new " + className + "(this.data);};proto.get=proto.set=function(){};proto.pick=function(){return null};return function construct_" + className + "(a){return new " + className + "(a);}";
        var procedure = new Function(code);
        return procedure();
      } else if (dimension === 0) {
        var code = "function " + className + "(a,d) {this.data = a;this.offset = d};var proto=" + className + ".prototype;proto.dtype='" + dtype + "';proto.index=function(){return this.offset};proto.dimension=0;proto.size=1;proto.shape=proto.stride=proto.order=[];proto.lo=proto.hi=proto.transpose=proto.step=function " + className + "_copy() {return new " + className + "(this.data,this.offset)};proto.pick=function " + className + "_pick(){return TrivialArray(this.data);};proto.valueOf=proto.get=function " + className + "_get(){return " + (useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]") + "};proto.set=function " + className + "_set(v){return " + (useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v") + "};return function construct_" + className + "(a,b,c,d){return new " + className + "(a,d)}";
        var procedure = new Function("TrivialArray", code);
        return procedure(CACHED_CONSTRUCTORS[dtype][0]);
      }
      var code = ["'use strict'"];
      var indices = iota(dimension);
      var args = indices.map(function(i2) {
        return "i" + i2;
      });
      var index_str = "this.offset+" + indices.map(function(i2) {
        return "this.stride[" + i2 + "]*i" + i2;
      }).join("+");
      var shapeArg = indices.map(function(i2) {
        return "b" + i2;
      }).join(",");
      var strideArg = indices.map(function(i2) {
        return "c" + i2;
      }).join(",");
      code.push(
        "function " + className + "(a," + shapeArg + "," + strideArg + ",d){this.data=a",
        "this.shape=[" + shapeArg + "]",
        "this.stride=[" + strideArg + "]",
        "this.offset=d|0}",
        "var proto=" + className + ".prototype",
        "proto.dtype='" + dtype + "'",
        "proto.dimension=" + dimension
      );
      code.push(
        "Object.defineProperty(proto,'size',{get:function " + className + "_size(){return " + indices.map(function(i2) {
          return "this.shape[" + i2 + "]";
        }).join("*"),
        "}})"
      );
      if (dimension === 1) {
        code.push("proto.order=[0]");
      } else {
        code.push("Object.defineProperty(proto,'order',{get:");
        if (dimension < 4) {
          code.push("function " + className + "_order(){");
          if (dimension === 2) {
            code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})");
          } else if (dimension === 3) {
            code.push(
              "var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);if(s0>s1){if(s1>s2){return [2,1,0];}else if(s0>s2){return [1,2,0];}else{return [1,0,2];}}else if(s0>s2){return [2,0,1];}else if(s2>s1){return [0,1,2];}else{return [0,2,1];}}})"
            );
          }
        } else {
          code.push("ORDER})");
        }
      }
      code.push(
        "proto.set=function " + className + "_set(" + args.join(",") + ",v){"
      );
      if (useGetters) {
        code.push("return this.data.set(" + index_str + ",v)}");
      } else {
        code.push("return this.data[" + index_str + "]=v}");
      }
      code.push("proto.get=function " + className + "_get(" + args.join(",") + "){");
      if (useGetters) {
        code.push("return this.data.get(" + index_str + ")}");
      } else {
        code.push("return this.data[" + index_str + "]}");
      }
      code.push(
        "proto.index=function " + className + "_index(",
        args.join(),
        "){return " + index_str + "}"
      );
      code.push("proto.hi=function " + className + "_hi(" + args.join(",") + "){return new " + className + "(this.data," + indices.map(function(i2) {
        return ["(typeof i", i2, "!=='number'||i", i2, "<0)?this.shape[", i2, "]:i", i2, "|0"].join("");
      }).join(",") + "," + indices.map(function(i2) {
        return "this.stride[" + i2 + "]";
      }).join(",") + ",this.offset)}");
      var a_vars = indices.map(function(i2) {
        return "a" + i2 + "=this.shape[" + i2 + "]";
      });
      var c_vars = indices.map(function(i2) {
        return "c" + i2 + "=this.stride[" + i2 + "]";
      });
      code.push("proto.lo=function " + className + "_lo(" + args.join(",") + "){var b=this.offset,d=0," + a_vars.join(",") + "," + c_vars.join(","));
      for (var i = 0; i < dimension; ++i) {
        code.push(
          "if(typeof i" + i + "==='number'&&i" + i + ">=0){d=i" + i + "|0;b+=c" + i + "*d;a" + i + "-=d}"
        );
      }
      code.push("return new " + className + "(this.data," + indices.map(function(i2) {
        return "a" + i2;
      }).join(",") + "," + indices.map(function(i2) {
        return "c" + i2;
      }).join(",") + ",b)}");
      code.push("proto.step=function " + className + "_step(" + args.join(",") + "){var " + indices.map(function(i2) {
        return "a" + i2 + "=this.shape[" + i2 + "]";
      }).join(",") + "," + indices.map(function(i2) {
        return "b" + i2 + "=this.stride[" + i2 + "]";
      }).join(",") + ",c=this.offset,d=0,ceil=Math.ceil");
      for (var i = 0; i < dimension; ++i) {
        code.push(
          "if(typeof i" + i + "==='number'){d=i" + i + "|0;if(d<0){c+=b" + i + "*(a" + i + "-1);a" + i + "=ceil(-a" + i + "/d)}else{a" + i + "=ceil(a" + i + "/d)}b" + i + "*=d}"
        );
      }
      code.push("return new " + className + "(this.data," + indices.map(function(i2) {
        return "a" + i2;
      }).join(",") + "," + indices.map(function(i2) {
        return "b" + i2;
      }).join(",") + ",c)}");
      var tShape = new Array(dimension);
      var tStride = new Array(dimension);
      for (var i = 0; i < dimension; ++i) {
        tShape[i] = "a[i" + i + "]";
        tStride[i] = "b[i" + i + "]";
      }
      code.push(
        "proto.transpose=function " + className + "_transpose(" + args + "){" + args.map(function(n, idx) {
          return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)";
        }).join(";"),
        "var a=this.shape,b=this.stride;return new " + className + "(this.data," + tShape.join(",") + "," + tStride.join(",") + ",this.offset)}"
      );
      code.push("proto.pick=function " + className + "_pick(" + args + "){var a=[],b=[],c=this.offset");
      for (var i = 0; i < dimension; ++i) {
        code.push("if(typeof i" + i + "==='number'&&i" + i + ">=0){c=(c+this.stride[" + i + "]*i" + i + ")|0}else{a.push(this.shape[" + i + "]);b.push(this.stride[" + i + "])}");
      }
      code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}");
      code.push("return function construct_" + className + "(data,shape,stride,offset){return new " + className + "(data," + indices.map(function(i2) {
        return "shape[" + i2 + "]";
      }).join(",") + "," + indices.map(function(i2) {
        return "stride[" + i2 + "]";
      }).join(",") + ",offset)}");
      var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"));
      return procedure(CACHED_CONSTRUCTORS[dtype], order);
    }
    function arrayDType(data) {
      if (isBuffer(data)) {
        return "buffer";
      }
      if (hasTypedArrays) {
        switch (Object.prototype.toString.call(data)) {
          case "[object Float64Array]":
            return "float64";
          case "[object Float32Array]":
            return "float32";
          case "[object Int8Array]":
            return "int8";
          case "[object Int16Array]":
            return "int16";
          case "[object Int32Array]":
            return "int32";
          case "[object Uint8Array]":
            return "uint8";
          case "[object Uint16Array]":
            return "uint16";
          case "[object Uint32Array]":
            return "uint32";
          case "[object Uint8ClampedArray]":
            return "uint8_clamped";
          case "[object BigInt64Array]":
            return "bigint64";
          case "[object BigUint64Array]":
            return "biguint64";
        }
      }
      if (Array.isArray(data)) {
        return "array";
      }
      return "generic";
    }
    var CACHED_CONSTRUCTORS = {
      "float32": [],
      "float64": [],
      "int8": [],
      "int16": [],
      "int32": [],
      "uint8": [],
      "uint16": [],
      "uint32": [],
      "array": [],
      "uint8_clamped": [],
      "bigint64": [],
      "biguint64": [],
      "buffer": [],
      "generic": []
    };
    function wrappedNDArrayCtor(data, shape, stride, offset) {
      if (data === void 0) {
        var ctor = CACHED_CONSTRUCTORS.array[0];
        return ctor([]);
      } else if (typeof data === "number") {
        data = [data];
      }
      if (shape === void 0) {
        shape = [data.length];
      }
      var d = shape.length;
      if (stride === void 0) {
        stride = new Array(d);
        for (var i = d - 1, sz = 1; i >= 0; --i) {
          stride[i] = sz;
          sz *= shape[i];
        }
      }
      if (offset === void 0) {
        offset = 0;
        for (var i = 0; i < d; ++i) {
          if (stride[i] < 0) {
            offset -= (shape[i] - 1) * stride[i];
          }
        }
      }
      var dtype = arrayDType(data);
      var ctor_list = CACHED_CONSTRUCTORS[dtype];
      while (ctor_list.length <= d + 1) {
        ctor_list.push(compileConstructor(dtype, ctor_list.length - 1));
      }
      var ctor = ctor_list[d + 1];
      return ctor(data, shape, stride, offset);
    }
    module2.exports = wrappedNDArrayCtor;
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  alphamask: () => alphamask,
  applySegmentationMask: () => applySegmentationMask,
  preload: () => preload,
  removeBackground: () => removeBackground,
  removeForeground: () => removeForeground,
  segmentForeground: () => segmentForeground
});
module.exports = __toCommonJS(index_exports);

// ../../node_modules/lodash-es/_freeGlobal.js
var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
var freeGlobal_default = freeGlobal;

// ../../node_modules/lodash-es/_root.js
var freeSelf = typeof self == "object" && self && self.Object === Object && self;
var root = freeGlobal_default || freeSelf || Function("return this")();
var root_default = root;

// ../../node_modules/lodash-es/_Symbol.js
var Symbol2 = root_default.Symbol;
var Symbol_default = Symbol2;

// ../../node_modules/lodash-es/_getRawTag.js
var objectProto = Object.prototype;
var hasOwnProperty = objectProto.hasOwnProperty;
var nativeObjectToString = objectProto.toString;
var symToStringTag = Symbol_default ? Symbol_default.toStringTag : void 0;
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
  try {
    value[symToStringTag] = void 0;
    var unmasked = true;
  } catch (e) {
  }
  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}
var getRawTag_default = getRawTag;

// ../../node_modules/lodash-es/_objectToString.js
var objectProto2 = Object.prototype;
var nativeObjectToString2 = objectProto2.toString;
function objectToString(value) {
  return nativeObjectToString2.call(value);
}
var objectToString_default = objectToString;

// ../../node_modules/lodash-es/_baseGetTag.js
var nullTag = "[object Null]";
var undefinedTag = "[object Undefined]";
var symToStringTag2 = Symbol_default ? Symbol_default.toStringTag : void 0;
function baseGetTag(value) {
  if (value == null) {
    return value === void 0 ? undefinedTag : nullTag;
  }
  return symToStringTag2 && symToStringTag2 in Object(value) ? getRawTag_default(value) : objectToString_default(value);
}
var baseGetTag_default = baseGetTag;

// ../../node_modules/lodash-es/isObject.js
function isObject(value) {
  var type = typeof value;
  return value != null && (type == "object" || type == "function");
}
var isObject_default = isObject;

// ../../node_modules/lodash-es/isFunction.js
var asyncTag = "[object AsyncFunction]";
var funcTag = "[object Function]";
var genTag = "[object GeneratorFunction]";
var proxyTag = "[object Proxy]";
function isFunction(value) {
  if (!isObject_default(value)) {
    return false;
  }
  var tag = baseGetTag_default(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}
var isFunction_default = isFunction;

// ../../node_modules/lodash-es/_coreJsData.js
var coreJsData = root_default["__core-js_shared__"];
var coreJsData_default = coreJsData;

// ../../node_modules/lodash-es/_isMasked.js
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData_default && coreJsData_default.keys && coreJsData_default.keys.IE_PROTO || "");
  return uid ? "Symbol(src)_1." + uid : "";
})();
function isMasked(func) {
  return !!maskSrcKey && maskSrcKey in func;
}
var isMasked_default = isMasked;

// ../../node_modules/lodash-es/_toSource.js
var funcProto = Function.prototype;
var funcToString = funcProto.toString;
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {
    }
    try {
      return func + "";
    } catch (e) {
    }
  }
  return "";
}
var toSource_default = toSource;

// ../../node_modules/lodash-es/_baseIsNative.js
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
var reIsHostCtor = /^\[object .+?Constructor\]$/;
var funcProto2 = Function.prototype;
var objectProto3 = Object.prototype;
var funcToString2 = funcProto2.toString;
var hasOwnProperty2 = objectProto3.hasOwnProperty;
var reIsNative = RegExp(
  "^" + funcToString2.call(hasOwnProperty2).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
);
function baseIsNative(value) {
  if (!isObject_default(value) || isMasked_default(value)) {
    return false;
  }
  var pattern = isFunction_default(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource_default(value));
}
var baseIsNative_default = baseIsNative;

// ../../node_modules/lodash-es/_getValue.js
function getValue(object, key) {
  return object == null ? void 0 : object[key];
}
var getValue_default = getValue;

// ../../node_modules/lodash-es/_getNative.js
function getNative(object, key) {
  var value = getValue_default(object, key);
  return baseIsNative_default(value) ? value : void 0;
}
var getNative_default = getNative;

// ../../node_modules/lodash-es/_nativeCreate.js
var nativeCreate = getNative_default(Object, "create");
var nativeCreate_default = nativeCreate;

// ../../node_modules/lodash-es/_hashClear.js
function hashClear() {
  this.__data__ = nativeCreate_default ? nativeCreate_default(null) : {};
  this.size = 0;
}
var hashClear_default = hashClear;

// ../../node_modules/lodash-es/_hashDelete.js
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}
var hashDelete_default = hashDelete;

// ../../node_modules/lodash-es/_hashGet.js
var HASH_UNDEFINED = "__lodash_hash_undefined__";
var objectProto4 = Object.prototype;
var hasOwnProperty3 = objectProto4.hasOwnProperty;
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate_default) {
    var result = data[key];
    return result === HASH_UNDEFINED ? void 0 : result;
  }
  return hasOwnProperty3.call(data, key) ? data[key] : void 0;
}
var hashGet_default = hashGet;

// ../../node_modules/lodash-es/_hashHas.js
var objectProto5 = Object.prototype;
var hasOwnProperty4 = objectProto5.hasOwnProperty;
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate_default ? data[key] !== void 0 : hasOwnProperty4.call(data, key);
}
var hashHas_default = hashHas;

// ../../node_modules/lodash-es/_hashSet.js
var HASH_UNDEFINED2 = "__lodash_hash_undefined__";
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = nativeCreate_default && value === void 0 ? HASH_UNDEFINED2 : value;
  return this;
}
var hashSet_default = hashSet;

// ../../node_modules/lodash-es/_Hash.js
function Hash(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
Hash.prototype.clear = hashClear_default;
Hash.prototype["delete"] = hashDelete_default;
Hash.prototype.get = hashGet_default;
Hash.prototype.has = hashHas_default;
Hash.prototype.set = hashSet_default;
var Hash_default = Hash;

// ../../node_modules/lodash-es/_listCacheClear.js
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}
var listCacheClear_default = listCacheClear;

// ../../node_modules/lodash-es/eq.js
function eq(value, other) {
  return value === other || value !== value && other !== other;
}
var eq_default = eq;

// ../../node_modules/lodash-es/_assocIndexOf.js
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq_default(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}
var assocIndexOf_default = assocIndexOf;

// ../../node_modules/lodash-es/_listCacheDelete.js
var arrayProto = Array.prototype;
var splice = arrayProto.splice;
function listCacheDelete(key) {
  var data = this.__data__, index = assocIndexOf_default(data, key);
  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}
var listCacheDelete_default = listCacheDelete;

// ../../node_modules/lodash-es/_listCacheGet.js
function listCacheGet(key) {
  var data = this.__data__, index = assocIndexOf_default(data, key);
  return index < 0 ? void 0 : data[index][1];
}
var listCacheGet_default = listCacheGet;

// ../../node_modules/lodash-es/_listCacheHas.js
function listCacheHas(key) {
  return assocIndexOf_default(this.__data__, key) > -1;
}
var listCacheHas_default = listCacheHas;

// ../../node_modules/lodash-es/_listCacheSet.js
function listCacheSet(key, value) {
  var data = this.__data__, index = assocIndexOf_default(data, key);
  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}
var listCacheSet_default = listCacheSet;

// ../../node_modules/lodash-es/_ListCache.js
function ListCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
ListCache.prototype.clear = listCacheClear_default;
ListCache.prototype["delete"] = listCacheDelete_default;
ListCache.prototype.get = listCacheGet_default;
ListCache.prototype.has = listCacheHas_default;
ListCache.prototype.set = listCacheSet_default;
var ListCache_default = ListCache;

// ../../node_modules/lodash-es/_Map.js
var Map = getNative_default(root_default, "Map");
var Map_default = Map;

// ../../node_modules/lodash-es/_mapCacheClear.js
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    "hash": new Hash_default(),
    "map": new (Map_default || ListCache_default)(),
    "string": new Hash_default()
  };
}
var mapCacheClear_default = mapCacheClear;

// ../../node_modules/lodash-es/_isKeyable.js
function isKeyable(value) {
  var type = typeof value;
  return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
}
var isKeyable_default = isKeyable;

// ../../node_modules/lodash-es/_getMapData.js
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable_default(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
}
var getMapData_default = getMapData;

// ../../node_modules/lodash-es/_mapCacheDelete.js
function mapCacheDelete(key) {
  var result = getMapData_default(this, key)["delete"](key);
  this.size -= result ? 1 : 0;
  return result;
}
var mapCacheDelete_default = mapCacheDelete;

// ../../node_modules/lodash-es/_mapCacheGet.js
function mapCacheGet(key) {
  return getMapData_default(this, key).get(key);
}
var mapCacheGet_default = mapCacheGet;

// ../../node_modules/lodash-es/_mapCacheHas.js
function mapCacheHas(key) {
  return getMapData_default(this, key).has(key);
}
var mapCacheHas_default = mapCacheHas;

// ../../node_modules/lodash-es/_mapCacheSet.js
function mapCacheSet(key, value) {
  var data = getMapData_default(this, key), size = data.size;
  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}
var mapCacheSet_default = mapCacheSet;

// ../../node_modules/lodash-es/_MapCache.js
function MapCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
MapCache.prototype.clear = mapCacheClear_default;
MapCache.prototype["delete"] = mapCacheDelete_default;
MapCache.prototype.get = mapCacheGet_default;
MapCache.prototype.has = mapCacheHas_default;
MapCache.prototype.set = mapCacheSet_default;
var MapCache_default = MapCache;

// ../../node_modules/lodash-es/memoize.js
var FUNC_ERROR_TEXT = "Expected a function";
function memoize(func, resolver) {
  if (typeof func != "function" || resolver != null && typeof resolver != "function") {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache_default)();
  return memoized;
}
memoize.Cache = MapCache_default;
var memoize_default = memoize;

// src/utils.ts
var import_ndarray2 = __toESM(require_ndarray());

// src/MimeType.ts
var MimeType = class _MimeType {
  type = "application/octet-stream";
  params = {};
  constructor(type, params) {
    this.type = type;
    this.params = params;
  }
  toString() {
    const paramsStr = [];
    for (const key in this.params) {
      const value = this.params[key];
      paramsStr.push(`${key}=${value}`);
    }
    return [this.type, ...paramsStr].join(";");
  }
  static create(type, params) {
    return new _MimeType(type, params);
  }
  isIdentical(other) {
    return this.type === other.type && this.params === other.params;
  }
  isEqual(other) {
    return this.type === other.type;
  }
  static fromString(mimeType) {
    const [type, ...paramsArr] = mimeType.split(";");
    const params = {};
    for (const param of paramsArr) {
      const [key, value] = param.split("=");
      params[key.trim()] = value.trim();
    }
    return new _MimeType(type, params);
  }
};

// src/codecs.ts
var import_ndarray = __toESM(require_ndarray());
async function imageDecode(blob) {
  const mime = MimeType.fromString(blob.type);
  switch (mime.type) {
    case "image/x-alpha8": {
      const width = parseInt(mime.params["width"]);
      const height = parseInt(mime.params["height"]);
      return (0, import_ndarray.default)(new Uint8Array(await blob.arrayBuffer()), [
        height,
        width,
        1
      ]);
    }
    case "image/x-rgba8": {
      const width = parseInt(mime.params["width"]);
      const height = parseInt(mime.params["height"]);
      return (0, import_ndarray.default)(new Uint8Array(await blob.arrayBuffer()), [
        height,
        width,
        4
      ]);
    }
    case "application/octet-stream":
    // this is an unknwon type
    case `image/png`:
    case `image/jpeg`:
    case `image/jpg`:
    case `image/webp`: {
      const imageBitmap = await createImageBitmap(blob);
      const imageData = imageBitmapToImageData(imageBitmap);
      return (0, import_ndarray.default)(new Uint8Array(imageData.data), [
        imageData.height,
        imageData.width,
        4
      ]);
    }
    default:
      throw new Error(
        `Invalid format: ${mime.type} with params: ${mime.params}`
      );
  }
}
async function imageEncode(imageTensor, quality = 0.8, format = "image/png") {
  const [height, width, channels] = imageTensor.shape;
  switch (format) {
    case "image/x-alpha8":
    case "image/x-rgba8": {
      const mime = MimeType.create(format, {
        width: width.toString(),
        height: height.toString()
      });
      return new Blob([imageTensor.data], { type: mime.toString() });
    }
    case `image/png`:
    case `image/jpeg`:
    case `image/webp`: {
      const imageData = new ImageData(
        new Uint8ClampedArray(imageTensor.data),
        width,
        height
      );
      var canvas = createCanvas(imageData.width, imageData.height);
      var ctx = canvas.getContext("2d");
      ctx.putImageData(imageData, 0, 0);
      return canvas.convertToBlob({ quality, type: format });
    }
    default:
      throw new Error(`Invalid format: ${format}`);
  }
}

// src/url.ts
function isAbsoluteURI(url) {
  const regExp = new RegExp("^(?:[a-z+]+:)?//", "i");
  return regExp.test(url);
}
function ensureAbsoluteURI(url, baseUrl) {
  if (isAbsoluteURI(url)) {
    return url;
  } else {
    return new URL(url, baseUrl).href;
  }
}

// src/utils.ts
function imageBitmapToImageData(imageBitmap) {
  var canvas = createCanvas(imageBitmap.width, imageBitmap.height);
  var ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
function createTypeArray(length) {
  if (typeof Uint8Array !== "undefined") {
    return new Uint8Array(length);
  } else if (typeof Uint8ClampedArray !== "undefined") {
    return new Uint8ClampedArray(length);
  } else if (typeof Uint16Array !== "undefined") {
    return new Uint16Array(length);
  } else if (typeof Uint32Array !== "undefined") {
    return new Uint32Array(length);
  } else if (typeof Float32Array !== "undefined") {
    return new Float32Array(length);
  } else if (typeof Float64Array !== "undefined") {
    return new Float64Array(length);
  } else {
    throw new Error("TypedArray not supported");
  }
}
function tensorResizeBilinear(imageTensor, newWidth, newHeight, proportional = false) {
  const [srcHeight, srcWidth, srcChannels] = imageTensor.shape;
  let scaleX = srcWidth / newWidth;
  let scaleY = srcHeight / newHeight;
  if (proportional) {
    const downscaling = Math.max(scaleX, scaleY) > 1;
    scaleX = scaleY = downscaling ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  }
  const resizedImageData = (0, import_ndarray2.default)(
    createTypeArray(srcChannels * newWidth * newHeight),
    [newHeight, newWidth, srcChannels]
  );
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = x * scaleX;
      const srcY = y * scaleY;
      const x1 = Math.max(Math.floor(srcX), 0);
      const x2 = Math.min(Math.ceil(srcX), srcWidth - 1);
      const y1 = Math.max(Math.floor(srcY), 0);
      const y2 = Math.min(Math.ceil(srcY), srcHeight - 1);
      const dx = srcX - x1;
      const dy = srcY - y1;
      for (let c = 0; c < srcChannels; c++) {
        const p1 = imageTensor.get(y1, x1, c);
        const p2 = imageTensor.get(y1, x2, c);
        const p3 = imageTensor.get(y2, x1, c);
        const p4 = imageTensor.get(y2, x2, c);
        const interpolatedValue = (1 - dx) * (1 - dy) * p1 + dx * (1 - dy) * p2 + (1 - dx) * dy * p3 + dx * dy * p4;
        resizedImageData.set(y, x, c, interpolatedValue);
      }
    }
  }
  return resizedImageData;
}
function tensorHWCtoBCHW(imageTensor, mean = [128, 128, 128], std = [256, 256, 256]) {
  var imageBufferData = imageTensor.data;
  const [srcHeight, srcWidth, srcChannels] = imageTensor.shape;
  const stride = srcHeight * srcWidth;
  const float32Data = new Float32Array(3 * stride);
  for (let i = 0, j = 0; i < imageBufferData.length; i += 4, j += 1) {
    float32Data[j] = (imageBufferData[i] - mean[0]) / std[0];
    float32Data[j + stride] = (imageBufferData[i + 1] - mean[1]) / std[1];
    float32Data[j + stride + stride] = (imageBufferData[i + 2] - mean[2]) / std[2];
  }
  return (0, import_ndarray2.default)(float32Data, [1, 3, srcHeight, srcWidth]);
}
async function imageSourceToImageData(image, config) {
  if (typeof image === "string") {
    image = ensureAbsoluteURI(image, config.publicPath);
    image = new URL(image);
  }
  if (image instanceof URL) {
    const response = await fetch(image, {});
    image = await response.blob();
  }
  if (image instanceof ArrayBuffer || ArrayBuffer.isView(image)) {
    image = new Blob([image]);
  }
  if (image instanceof Blob) {
    image = await imageDecode(image);
  }
  return image;
}
function convertFloat32ToUint8(float32Array) {
  const uint8Array = new Uint8Array(float32Array.data.length);
  for (let i = 0; i < float32Array.data.length; i++) {
    uint8Array[i] = float32Array.data[i] * 255;
  }
  return (0, import_ndarray2.default)(uint8Array, float32Array.shape);
}
function createCanvas(width, height) {
  let canvas = void 0;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement("canvas");
  }
  if (!canvas) {
    throw new Error(
      `Canvas nor OffscreenCanvas are available in the current context.`
    );
  }
  return canvas;
}

// src/onnx.ts
var import_ndarray3 = __toESM(require_ndarray());

// src/capabilities.js
var webgpu = async () => {
  if (navigator.gpu === void 0) return false;
  const adapter = await navigator.gpu.requestAdapter();
  return adapter !== null;
};
var maxNumThreads = () => navigator.hardwareConcurrency ?? 4;

// src/resource.ts
async function loadAsUrl(url, config) {
  return URL.createObjectURL(await loadAsBlob(url, config));
}
async function loadAsBlob(key, config) {
  const resourceUrl = new URL("resources.json", config.publicPath);
  const resourceResponse = await fetch(resourceUrl);
  if (!resourceResponse.ok) {
    throw new Error(
      `Resource metadata not found. Ensure that the config.publicPath is configured correctly.`
    );
  }
  const resourceMap = await resourceResponse.json();
  const entry = resourceMap[key];
  if (!entry) {
    throw new Error(
      `Resource ${key} not found. Ensure that the config.publicPath is configured correctly.`
    );
  }
  const chunks = entry.chunks;
  let downloadedSize = 0;
  const responses = chunks.map(async (chunk) => {
    const chunkSize = chunk.offsets[1] - chunk.offsets[0];
    const url = config.publicPath ? new URL(chunk.name, config.publicPath).toString() : chunk.name;
    const response = await fetch(url, config.fetchArgs);
    const blob = await response.blob();
    if (chunkSize !== blob.size) {
      throw new Error(
        `Failed to fetch ${key} with size ${chunkSize} but got ${blob.size}`
      );
    }
    if (config.progress) {
      downloadedSize += chunkSize;
      config.progress(`fetch:${key}`, downloadedSize, entry.size);
    }
    return blob;
  });
  const allChunkData = await Promise.all(responses);
  const data = new Blob(allChunkData, { type: entry.mime });
  if (data.size !== entry.size) {
    throw new Error(
      `Failed to fetch ${key} with size ${entry.size} but got ${data.size}`
    );
  }
  return data;
}

// src/onnx.ts
var ort = null;
var getOrt = async (useWebGPU) => {
  if (ort !== null) {
    return ort;
  }
  if (useWebGPU) {
    ort = (await import("onnxruntime-web/webgpu")).default;
  } else {
    ort = (await import("onnxruntime-web")).default;
  }
  return ort;
};
async function createOnnxSession(model, config) {
  const useWebGPU = config.device === "gpu" && await webgpu();
  const proxyToWorker = useWebGPU && config.proxyToWorker;
  const executionProviders = [useWebGPU ? "webgpu" : "wasm"];
  const ort2 = await getOrt(useWebGPU);
  if (config.debug) {
    console.debug("	Using WebGPU:", useWebGPU);
    console.debug("	Proxy to Worker:", proxyToWorker);
    ort2.env.debug = true;
    ort2.env.logLevel = "verbose";
  }
  ort2.env.wasm.numThreads = maxNumThreads();
  ort2.env.wasm.proxy = proxyToWorker;
  const baseFilePath = useWebGPU ? "/onnxruntime-web/ort-wasm-simd-threaded.jsep" : "/onnxruntime-web/ort-wasm-simd-threaded";
  const wasmPath = await loadAsUrl(`${baseFilePath}.wasm`, config);
  const mjsPath = await loadAsUrl(`${baseFilePath}.mjs`, config);
  ort2.env.wasm.wasmPaths = {
    mjs: mjsPath,
    wasm: wasmPath
  };
  if (config.debug) {
    console.debug("ort.env.wasm:", ort2.env.wasm);
  }
  const ortConfig = {
    executionProviders,
    graphOptimizationLevel: "all",
    executionMode: "parallel",
    enableCpuMemArena: true
  };
  const session = await ort2.InferenceSession.create(model, ortConfig).catch(
    (e) => {
      throw new Error(
        `Failed to create session: "${e}". Please check if the publicPath is set correctly.`
      );
    }
  );
  return session;
}
async function runOnnxSession(session, inputs, outputs, config) {
  const useWebGPU = config.device === "gpu" && await webgpu();
  const ort2 = await getOrt(useWebGPU);
  const feeds = {};
  for (const [key, tensor] of inputs) {
    feeds[key] = new ort2.Tensor(
      "float32",
      new Float32Array(tensor.data),
      tensor.shape
    );
  }
  const outputData = await session.run(feeds, {});
  const outputKVPairs = [];
  for (const key of outputs) {
    const output = outputData[key];
    const shape = output.dims;
    const data = output.data;
    const tensor = (0, import_ndarray3.default)(data, shape);
    outputKVPairs.push(tensor);
  }
  return outputKVPairs;
}

// src/schema.ts
var import_zod = require("zod");
var upstreamPackage = { name: "@imgly/background-removal", version: "1.7.0" };
var legacyNumber = () => import_zod.z.union([import_zod.z.number(), import_zod.z.literal(Infinity), import_zod.z.literal(-Infinity)]);
var progressFunction = import_zod.z.function({
  input: import_zod.z.tuple([import_zod.z.string(), legacyNumber(), legacyNumber()]).rest(import_zod.z.unknown()),
  output: import_zod.z.void()
});
var progressSchema = import_zod.z.custom((value) => typeof value === "function", {
  error: "Expected function"
}).transform((callback) => progressFunction.implement(callback));
var ConfigSchema = import_zod.z.object({
  publicPath: import_zod.z.string().optional().describe("The public path to the wasm files and the onnx model.").default(
    "https://staticimgly.com/@imgly/background-removal-data/${PACKAGE_VERSION}/dist/"
  ).transform((val) => {
    return val.replace("${PACKAGE_NAME}", upstreamPackage.name).replace("${PACKAGE_VERSION}", upstreamPackage.version);
  }),
  debug: import_zod.z.boolean().default(false).describe("Whether to enable debug logging."),
  rescale: import_zod.z.boolean().default(true).describe("Whether to rescale the image."),
  device: import_zod.z.enum(["cpu", "gpu"]).default("cpu").describe("The device to run the model on."),
  proxyToWorker: import_zod.z.boolean().default(false).describe("Whether to proxy inference to a web worker."),
  fetchArgs: import_zod.z.any().default({}).describe("Arguments to pass to fetch when loading the model."),
  progress: progressSchema.describe("Progress callback.").optional(),
  model: import_zod.z.preprocess(
    (val) => {
      switch (val) {
        case "large":
          return "isnet";
        case "small":
          return "isnet_quint8";
        case "medium":
          return "isnet_fp16";
        default:
          return val;
      }
    },
    import_zod.z.enum(["isnet", "isnet_fp16", "isnet_quint8"])
  ).prefault("medium"),
  output: import_zod.z.object({
    format: import_zod.z.enum([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/x-rgba8",
      "image/x-alpha8"
    ]).default("image/png"),
    quality: legacyNumber().default(0.8)
  }).prefault({})
}).prefault({}).transform((config) => {
  if (config.debug) console.log("Config:", config);
  if (config.debug && !config.progress) {
    config.progress = config.progress ?? ((key, current, total) => {
      console.debug(`Downloading ${key}: ${current} of ${total}`);
    });
    if (!crossOriginIsolated) {
      if (config.debug)
        console.debug(
          "Cross-Origin-Isolated is not enabled. Performance will be degraded. Please see  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer."
        );
    }
  }
  return config;
});
function validateConfig(configuration) {
  return ConfigSchema.parse(configuration ?? {});
}

// src/inference.ts
var import_ndarray4 = __toESM(require_ndarray());
async function initBase(config) {
  if (config.debug) console.debug("Loading model...", config.model);
  const model = config.model;
  const blob = await loadAsBlob(`/models/${model}`, config);
  const arrayBuffer = await blob.arrayBuffer();
  const session = await createOnnxSession(arrayBuffer, config);
  return session;
}
async function initInference(config) {
  config = validateConfig(config);
  const base = await initBase(config);
  return { config, session: { base } };
}
async function runInference(imageTensor, config, session) {
  const resolution = 1024;
  const [srcHeight, srcWidth, srcChannels] = imageTensor.shape;
  const keepAspect = false;
  let resizedImageTensor = tensorResizeBilinear(
    imageTensor,
    resolution,
    resolution,
    keepAspect
  );
  const inputTensor = tensorHWCtoBCHW(resizedImageTensor);
  let predictionsDict = await runOnnxSession(
    session.base,
    [["input", inputTensor]],
    ["output"],
    config
  );
  let alphamask2 = (0, import_ndarray4.default)(predictionsDict[0].data, [resolution, resolution, 1]);
  let alphamaskU8 = convertFloat32ToUint8(alphamask2);
  if (config.rescale) {
    alphamaskU8 = tensorResizeBilinear(
      alphamaskU8,
      srcWidth,
      srcHeight,
      keepAspect
    );
    return [alphamaskU8, imageTensor];
  } else {
    return [alphamaskU8, resizedImageTensor];
  }
}

// src/api/v1.ts
var init = memoize_default(initInference, (config) => JSON.stringify(config));
async function preload(configuration) {
  await init(configuration);
  return;
}
async function removeBackground(image, configuration) {
  const { config, session } = await init(configuration);
  if (config.progress) config.progress("compute:decode", 0, 4);
  const inputImageTensor = await imageSourceToImageData(image, config);
  config.progress?.("compute:inference", 1, 4);
  const [alphamask2, imageTensor] = await runInference(
    inputImageTensor,
    config,
    session
  );
  config.progress?.("compute:mask", 2, 4);
  const outImageTensor = imageTensor;
  const [width, height] = outImageTensor.shape;
  const stride = width * height;
  for (let i = 0; i < stride; i += 1) {
    outImageTensor.data[4 * i + 3] = alphamask2.data[i];
  }
  config.progress?.("compute:encode", 3, 4);
  const outImage = await imageEncode(
    outImageTensor,
    config.output.quality,
    config.output.format
  );
  config.progress?.("compute:encode", 4, 4);
  return outImage;
}
async function removeForeground(image, configuration) {
  const { config, session } = await init(configuration);
  const imageTensor = await imageSourceToImageData(image, config);
  const [alphamask2, imageInput] = await runInference(
    imageTensor,
    config,
    session
  );
  const outImageTensor = imageInput;
  const [width, height, channels] = outImageTensor.shape;
  const stride = width * height;
  for (let i = 0; i < stride; i += 1) {
    outImageTensor.data[4 * i + 3] = 255 - alphamask2.data[i];
  }
  const outImage = await imageEncode(
    outImageTensor,
    config.output.quality,
    config.output.format
  );
  return outImage;
}
var alphamask = segmentForeground;
async function segmentForeground(image, configuration) {
  const { config, session } = await init(configuration);
  const imageTensor = await imageSourceToImageData(image, config);
  let [height, width, channels] = imageTensor.shape;
  const [alphamask2, imageInput] = await runInference(
    imageTensor,
    config,
    session
  );
  const stride = width * height;
  const outImageTensor = imageTensor;
  for (let i = 0; i < stride; i += 1) {
    const index = 4 * i;
    let alpha = alphamask2.data[i];
    outImageTensor.data[index] = 255;
    outImageTensor.data[index + 1] = 255;
    outImageTensor.data[index + 2] = 255;
    outImageTensor.data[index + 3] = alpha;
  }
  const outImage = await imageEncode(
    outImageTensor,
    config.output.quality,
    config.output.format
  );
  return outImage;
}
async function applySegmentationMask(image, mask, config) {
  config = validateConfig(config);
  const imageTensor = await imageSourceToImageData(image, config);
  const [imageHeight, imageWidth, imageChannels] = imageTensor.shape;
  const maskTensor = await imageSourceToImageData(mask, config);
  const [maskHeight, maskWidth, maskChannels] = maskTensor.shape;
  const alphaMask = maskHeight !== imageHeight || maskWidth !== imageWidth ? tensorResizeBilinear(maskTensor, imageWidth, imageHeight) : maskTensor;
  const stride = imageWidth * imageHeight;
  for (let i = 0; i < stride; i += 1) {
    const idxImage = imageChannels * i;
    const idxMask = maskChannels * i;
    imageTensor.data[idxImage + 3] = alphaMask.data[idxMask + 3];
  }
  const outImage = await imageEncode(
    imageTensor,
    config.output.quality,
    config.output.format
  );
  return outImage;
}
/*! Bundled license information:

is-buffer/index.js:
  (*!
   * Determine if an object is a Buffer
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)
*/
//# sourceMappingURL=index.cjs.map
