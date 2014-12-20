/*
 (c) 2013, Vladimir Agafonkin
 rbush, a JavaScript library for high-performance 2D spatial
 indexing of points and rectangles.
 https://github.com/mourner/rbush
 */

/**
 * @module exports
 * @type {RBush}
 */
module.exports = RBush;
/**
 * @description RBush
 * @param maxEntries
 * @param format
 * @constructor
 */
function RBush(maxEntries, format) {
  // jshint newcap: false, validthis: true
  if (!(this instanceof RBush)) {
    return new RBush(maxEntries, format);
  }

  // max entries in a node is 9 by default; min node fill is 40% for best performance
  this._maxEntries = Math.max(4, maxEntries || 9);
  this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));

  if (format) {
    _initFormat(this, format);
  }
  this.all    = all.bind(null, this);
  this.search = search.bind(null, this);
  this.load   = load.bind(null, this);
  this.insert = insert.bind(null, this);
  this.clear  = clear.bind(null, this);
  this.remove = remove.bind(null, this);
  this.toJSON = toJSON.bind(null, this);
  this.fromJSON = fromJSON.bind(null, this);

  clear(this);
}
/**
 * @description prototype
 */
var proto = RBush.prototype;

function toJSON(tree) {
  return tree.data;
}

function fromJSON(tree, data) {
  tree.data = data;
  return tree;
}

proto.compareMinX  = compareMinX;
proto.compareMinY  = compareMinY;
proto.toBBox       = toBBox;


function all(tree) {
  "use strict";
  return _all(tree.data, []);
}

function search(tree, bbox) {

  var node = tree.data,
      result = [],
      toBBox = tree.toBBox;

  if (!intersects(bbox, node.bbox)) {
    return result;
  }

  var nodesToSearch = [],
      i, len, child, childBBox;

  while (node) {
    for (i = 0, len = node.children.length; i < len; i++) {

      child = node.children[i];
      childBBox = node.leaf ? toBBox(child) : child.bbox;

      if (intersects(bbox, childBBox)) {
        if (node.leaf) {
          result.push(child);
        }
        else if (contains(bbox, childBBox)) {
          _all(child, result);
        }
        else {
          nodesToSearch.push(child);
        }
      }
    }
    node = nodesToSearch.pop();
  }

  return result;
}

function load(tree, data) {
  if (!(data && data.length)) {
    return tree;
  }

  if (data.length < tree._minEntries) {
    for (var i = 0, len = data.length; i < len; i++) {
      insert(tree, data[i]);
    }
    return tree;
  }

  // recursively build the tree with the given data from stratch using OMT algorithm
  var node = _build(tree, data.slice(), 0, data.length - 1, 0);

  if (!tree.data.children.length) {
    // save as is if tree is empty
    tree.data = node;

  }
  else if (tree.data.height === node.height) {
    // split root if trees have the same height
    _splitRoot(tree, tree.data, node);

  }
  else {
    if (tree.data.height < node.height) {
      // swap trees if inserted one is bigger
      var tmpNode = tree.data;
      tree.data = node;
      node = tmpNode;
    }

    // insert the small tree into the large tree at appropriate level
    _insert(tree, node, tree.data.height - node.height - 1, true);
  }

  return tree;
}

function insert(tree, item) {
  if (item) {
    _insert(tree, item, tree.data.height - 1);
  }
  return tree;
}

function clear(tree) {
  "use strict";
  tree.data = {
    children: [],
    height  : 1,
    bbox    : empty(),
    leaf    : true
  };
  return tree;
}

function remove(tree, item) {
  if (!item) {
    return tree;
  }

  var node = tree.data,
      bbox = tree.toBBox(item),
      path = [],
      indexes = [],
      i, parent, index, goingUp;

  // depth-first iterative tree traversal
  while (node || path.length) {

    if (!node) { // go up
      node = path.pop();
      parent = path[path.length - 1];
      i = indexes.pop();
      goingUp = true;
    }

    if (node.leaf) { // check current node
      index = node.children.indexOf(item);

      if (index !== -1) {
        // item found, remove the item and condense tree upwards
        node.children.splice(index, 1);
        path.push(node);
        _condense(tree, path);
        return tree;
      }
    }

    if (!goingUp && !node.leaf && contains(node.bbox, bbox)) { // go down
      path.push(node);
      indexes.push(i);
      i = 0;
      parent = node;
      node = node.children[0];

    }
    else if (parent) { // go right
      i++;
      node = parent.children[i];
      goingUp = false;

    }
    else {
      node = null;
    } // nothing found
  }

  return tree;
}

function toBBox(item) { return item; }

function compareMinX( a, b) { return a[0] - b[0]; }

function compareMinY( a, b) { return a[1] - b[1]; }

function _all(node, result) {
  var nodesToSearch = [];
  while (node) {
    if (node.leaf) {
      result.push.apply(result, node.children);
    }
    else {
      nodesToSearch.push.apply(nodesToSearch, node.children);
    }

    node = nodesToSearch.pop();
  }
  return result;
}

function _build(tree, items, left, right, height) {
  "use strict";

  var N = right - left + 1,
      M = tree._maxEntries,
      node;

  if (N <= M) {
    // reached leaf level; return leaf
    node = {
      children: items.slice(left, right + 1),
      height  : 1,
      bbox    : null,
      leaf    : true
    };
    calcBBox(node, tree.toBBox);
    return node;
  }

  if (!height) {
    // target height of the bulk-loaded tree
    height = Math.ceil(Math.log(N) / Math.log(M));

    // target number of root entries to maximize storage utilization
    M = Math.ceil(N / Math.pow(M, height - 1));
  }

  // TODO eliminate recursion?

  node = {
    children: [],
    height  : height,
    bbox    : null
  };

  // split the items into M mostly square tiles

  var N2 = Math.ceil(N / M),
      N1 = N2 * Math.ceil(Math.sqrt(M)),
      i, j, right2, right3;

  multiSelect(items, left, right, N1, tree.compareMinX);

  for (i = left; i <= right; i += N1) {

    right2 = Math.min(i + N1 - 1, right);

    multiSelect(items, i, right2, N2, tree.compareMinY);

    for (j = i; j <= right2; j += N2) {

      right3 = Math.min(j + N2 - 1, right2);

      // pack each entry recursively
      node.children.push(_build(tree, items, j, right3, height - 1));
    }
  }

  calcBBox(node, tree.toBBox);

  return node;
}

function _chooseSubtree(bbox, node, level, path) {
  "use strict";

  var i, len, child, targetNode, area, enlargement, minArea, minEnlargement;

  while (true) {
    path.push(node);

    if (node.leaf || path.length - 1 === level) {
      break;
    }

    minArea = minEnlargement = Infinity;

    for (i = 0, len = node.children.length; i < len; i++) {
      child = node.children[i];
      area = bboxArea(child.bbox);
      enlargement = enlargedArea(bbox, child.bbox) - area;

      // choose entry with the least area enlargement
      if (enlargement < minEnlargement) {
        minEnlargement = enlargement;
        minArea = area < minArea ? area : minArea;
        targetNode = child;

      }
      else if (enlargement === minEnlargement) {
        // otherwise choose one with the smallest area
        if (area < minArea) {
          minArea = area;
          targetNode = child;
        }
      }
    }

    node = targetNode;
  }

  return node;
}

function _insert(tree, item, level, isNode) {

  var toBBox = tree.toBBox,
      bbox = isNode ? item.bbox : toBBox(item),
      insertPath = [];

  // find the best node for accommodating the item, saving all nodes along the path too
  var node = _chooseSubtree(bbox, tree.data, level, insertPath);

  // put the item into the node
  node.children.push(item);
  extend(node.bbox, bbox);

  // split on node overflow; propagate upwards if necessary
  while (level >= 0) {
    if (insertPath[level].children.length > tree._maxEntries) {
      _split(tree, insertPath, level);
      level--;
    }
    else {
      break;
    }
  }

  // adjust bboxes along the insertion path
  _adjustParentBBoxes(bbox, insertPath, level);
}

// split overflowed node into two
function _split(tree, insertPath, level) {
  "use strict";

  var node = insertPath[level],
      M = node.children.length,
      m = tree._minEntries;

  _chooseSplitAxis(tree, node, m, M);

  var newNode = {
    children: node.children.splice(_chooseSplitIndex(tree, node, m, M)),
    height  : node.height
  };

  if (node.leaf) {
    newNode.leaf = true;
  }

  calcBBox(node, tree.toBBox);
  calcBBox(newNode, tree.toBBox);

  if (level) {
    insertPath[level - 1].children.push(newNode);
  }
  else {
    _splitRoot(tree, node, newNode);
  }
}

function _splitRoot(tree, node, newNode) {
  "use strict";

  // split root node
  tree.data = {
    children: [node, newNode],
    height  : node.height + 1
  };
  calcBBox(tree.data, tree.toBBox);
}

function _chooseSplitIndex(tree, node, m, M) {
  "use strict";

  var i, bbox1, bbox2, overlap, area, minOverlap, minArea, index;

  minOverlap = minArea = Infinity;

  for (i = m; i <= M - m; i++) {
    bbox1 = distBBox(node, 0, i, tree.toBBox);
    bbox2 = distBBox(node, i, M, tree.toBBox);

    overlap = intersectionArea(bbox1, bbox2);
    area = bboxArea(bbox1) + bboxArea(bbox2);

    // choose distribution with minimum overlap
    if (overlap < minOverlap) {
      minOverlap = overlap;
      index = i;

      minArea = area < minArea ? area : minArea;

    }
    else if (overlap === minOverlap) {
      // otherwise choose distribution with minimum area
      if (area < minArea) {
        minArea = area;
        index = i;
      }
    }
  }

  return index;
}

// sorts node children by the best axis for split
function _chooseSplitAxis(tree, node, m, M) {
  "use strict";

  var compareMinX = node.leaf ? tree.compareMinX : compareNodeMinX,
      compareMinY = node.leaf ? tree.compareMinY : compareNodeMinY,
      xMargin = _allDistMargin(tree, node, m, M, compareMinX),
      yMargin = _allDistMargin(tree, node, m, M, compareMinY);

  // if total distributions margin value is minimal for x, sort by minX,
  // otherwise it's already sorted by minY
  if (xMargin < yMargin) {
    node.children.sort(compareMinX);
  }
}

// total margin of all possible split distributions where each node is at least m full
function _allDistMargin(tree, node, m, M, compare) {
  "use strict";

  node.children.sort(compare);

  var toBBox = tree.toBBox,
      leftBBox = distBBox(node, 0, m, toBBox),
      rightBBox = distBBox(node, M - m, M, toBBox),
      margin = bboxMargin(leftBBox) + bboxMargin(rightBBox),
      i, child;

  for (i = m; i < M - m; i++) {
    child = node.children[i];
    extend(leftBBox, node.leaf ? toBBox(child) : child.bbox);
    margin += bboxMargin(leftBBox);
  }

  for (i = M - m - 1; i >= m; i--) {
    child = node.children[i];
    extend(rightBBox, node.leaf ? toBBox(child) : child.bbox);
    margin += bboxMargin(rightBBox);
  }

  return margin;
}

function _adjustParentBBoxes(bbox, path, level) {
  // adjust bboxes along the given tree path
  for (var i = level; i >= 0; i--) {
    extend(path[i].bbox, bbox);
  }
}

function _condense(tree, path) {
  // go through the path, removing empty nodes and updating bboxes
  for (var i = path.length - 1, siblings; i >= 0; i--) {
    if (path[i].children.length === 0) {
      if (i > 0) {
        siblings = path[i - 1].children;
        siblings.splice(siblings.indexOf(path[i]), 1);

      }
      else {
        clear(tree);
      }

    }
    else {
      calcBBox(path[i], tree.toBBox);
    }
  }
}

function _initFormat(tree, format) {
  "use strict";
  // data format (minX, minY, maxX, maxY accessors)
  // uses eval-type function compilation instead of just accepting a toBBox function
  // because the algorithms are very sensitive to sorting functions performance,
  // so they should be dead simple and without inner calls
  // jshint evil: true

  var compareArr    = ['return a', ' - b', ';'];
  tree.compareMinX  = new Function('a', 'b', compareArr.join(format[0]));
  tree.compareMinY  = new Function('a', 'b', compareArr.join(format[1]));
  tree.toBBox       = new Function('a', 'return [a' + format.join(', a') + '];');
}

//-----------------------------------------------------------------------------------------

// calculate node's bbox from bboxes of its children
function calcBBox(node, toBBox) {
  "use strict";
  node.bbox = distBBox(node, 0, node.children.length, toBBox);
}

// min bounding rectangle of node children from k to p-1
function distBBox(node, k, p, toBBox) {
  "use strict";

  var bbox = empty();

  for (var i = k, child; i < p; i++) {
    child = node.children[i];
    extend(bbox, node.leaf ? toBBox(child) : child.bbox);
  }

  return bbox;
}

function empty() {
  return [Infinity, Infinity, -Infinity, -Infinity];
}

function extend(a, b) {
  a[0] = Math.min(a[0], b[0]);
  a[1] = Math.min(a[1], b[1]);
  a[2] = Math.max(a[2], b[2]);
  a[3] = Math.max(a[3], b[3]);
  return a;
}

function compareNodeMinX(a, b) {
  return a.bbox[0] - b.bbox[0];
}

function compareNodeMinY(a, b) {
  return a.bbox[1] - b.bbox[1];
}

function bboxArea(a) {
  return (a[2] - a[0]) * (a[3] - a[1]);
}

function bboxMargin(a) {
  return (a[2] - a[0]) + (a[3] - a[1]);
}

function enlargedArea(a, b) {
  return (Math.max(b[2], a[2]) - Math.min(b[0], a[0])) *
         (Math.max(b[3], a[3]) - Math.min(b[1], a[1]));
}

function intersectionArea(a, b) {
  var minX = Math.max(a[0], b[0]),
      minY = Math.max(a[1], b[1]),
      maxX = Math.min(a[2], b[2]),
      maxY = Math.min(a[3], b[3]);

  return Math.max(0, maxX - minX) *
         Math.max(0, maxY - minY);
}

function contains(a, b) {
  return a[0] <= b[0] &&
         a[1] <= b[1] &&
         b[2] <= a[2] &&
         b[3] <= a[3];
}

function intersects(a, b) {
  return b[0] <= a[2] &&
         b[1] <= a[3] &&
         b[2] >= a[0] &&
         b[3] >= a[1];
}

// sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
// combines selection algorithm with binary divide & conquer approach

function multiSelect(arr, left, right, n, compare) {
  var stack = [left, right], mid;

  while (stack.length) {
    right = stack.pop();
    left  = stack.pop();

    if (right - left <= n) {
      continue;
    }

    mid = left + Math.ceil((right - left) / n / 2) * n;
    select(arr, left, right, mid, compare);

    stack.push(left, mid, mid, right);
  }
}

// sort array between left and right (inclusive) so that the smallest k elements come first (unordered)
function select(arr, left, right, k, compare) {
  var n, i, z, s, sd, newLeft, newRight, t, j;

  while (right > left) {
    if (right - left > 600) {
      n = right - left + 1;
      i = k - left + 1;
      z = Math.log(n);
      s = 0.5 * Math.exp(2 * z / 3);
      sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (i - n / 2 < 0 ? -1 : 1);
      newLeft = Math.max(left, Math.floor(k - i * s / n + sd));
      newRight = Math.min(right, Math.floor(k + (n - i) * s / n + sd));
      select(arr, newLeft, newRight, k, compare);
    }

    t = arr[k];
    i = left;
    j = right;

    swap(arr, left, k);
    if (compare(arr[right], t) > 0) {
      swap(arr, left, right);
    }

    while (i < j) {
      swap(arr, i, j);
      i++;
      j--;
      while (compare(arr[i], t) < 0) {
        i++;
      }
      while (compare(arr[j], t) > 0) {
        j--;
      }
    }

    if (compare(arr[left], t) === 0) {
      swap(arr, left, j);
    }
    else {
      j++;
      swap(arr, j, right);
    }

    if (j <= k) {
      left = j + 1;
    }
    if (k <= j) {
      right = j - 1;
    }
  }
}

function swap(arr, i, j) {
  var tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}