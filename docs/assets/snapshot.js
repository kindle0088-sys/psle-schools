/* 数据快照声明（index.html / map.html 用）
 * 这两页是手写静态页，没有生成器注入页脚；改为直接读 docs/data/schools.json
 * 的 meta.generatedAt，避免「采集于 2026-11」这类会过期的写死文案。
 * 页面需经 HTTP 打开（file:// 的 fetch 会被浏览器拦截，项目本来就要求 HTTP）。 */
(function () {
  var el = document.getElementById('dataSnapshot');
  if (!el) return;
  fetch('data/schools.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var m = d.meta || {};
      if (!m.generatedAt) return;
      var dt = new Date(Date.parse(m.generatedAt) + 8 * 3600 * 1000);
      var day = dt.getUTCFullYear() + '-' +
        String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(dt.getUTCDate()).padStart(2, '0');
      el.innerHTML = '<b>数据快照</b>　学校主数据（' + m.total + ' 所 / COP ' + m.copYear +
        ' 年度）更新于 ' + day + ' SGT。';
    })
    .catch(function () { /* 读不到就留占位符，不编一个日期 */ });
})();
