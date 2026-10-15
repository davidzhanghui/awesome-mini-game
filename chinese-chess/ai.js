/* 中国象棋 AI Worker：重放棋谱（保留重复局面历史）后搜索最佳着法 */
importScripts('xq.js?v=20261015');
self.onmessage = function (e) {
  var d = e.data, pos = new XQ.Pos(d.fen);
  for (var i = 0; i < d.moves.length; i++) pos.make(d.moves[i]);
  var r = XQ.search(pos, { time: d.time, depth: d.depth, noise: d.noise });
  self.postMessage({ id: d.id, move: r.move, score: r.score, depth: r.depth, nodes: r.nodes });
};
