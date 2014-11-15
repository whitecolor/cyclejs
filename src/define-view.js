'use strict';
var Rx = require('rx');
var BackwardFunction = require('./backward-function');
var errors = require('./errors');

function noop() {}

function getFunctionForwardIntoStream(stream) {
  return function forwardIntoStream(ev) { stream.onNext(ev); };
}

// traverse the vtree, replacing the value of 'ev-*' fields with
// `function (ev) { view[$PREVIOUS_VALUE].onNext(ev); }`
function replaceStreamNameWithForwardFunction(node, view) {
  if (node && node.type === 'VirtualNode' && typeof node.hooks !== 'undefined') {
    var vtree = node;
    for (var key in vtree.hooks) {
      if (vtree.hooks.hasOwnProperty(key)) {
        var streamName = vtree.hooks[key].value;
        if (view[streamName]) {
          vtree.hooks[key].value = getFunctionForwardIntoStream(view[streamName]);
        } else {
          vtree.hooks[key].value = noop;
        }
      }
    }
  }
  if (node && node.type === 'Thunk') {
    var thunk = node;
    var originalFn = thunk.fn;
    thunk.fn = function () {
      var vtree = originalFn.apply(null, arguments);
      replaceStreamNameWithForwardFunction(vtree, view);
      return vtree;
    };
  }
  if (node && Array.isArray(node.children)) {
    for (var i = 0; i < node.children.length; i++) {
      replaceStreamNameWithForwardFunction(node.children[i], view);
    }
  }
}

function defineView() {
  var view = BackwardFunction.apply({}, arguments);
  view = errors.customInterfaceErrorMessageInInject(view,
    'View expects Model to have the required property '
  );
  if (view.events) {
    for (var i = view.events.length - 1; i >= 0; i--) {
      view[view.events[i]] = new Rx.Subject();
    }
    delete view.events;
  }
  view.vtree$ = view.vtree$.map(function (vtree) {
    // TODO throw error if vtree is not of type vtree or is undefined
    replaceStreamNameWithForwardFunction(vtree, view);
    return vtree;
  });
  view.clone = function () {
    return defineView.apply({}, arguments);
  };
  return view;
}

module.exports = defineView;
