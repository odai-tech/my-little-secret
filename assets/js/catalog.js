/* Joy — the menu, sizes, prices and ordering rules. ONE source of truth:
   the website reads it as window.JOY_CATALOG, the payment server require()s it,
   so the price a customer is charged is always computed from this file on the
   server, never taken from the browser. Prices are in shekels (ILS). */
(function (root) {
  'use strict';
  const CATALOG = {
    currency: 'ILS',
    timeZone: 'Asia/Jerusalem',   // "today" and "2 days ahead" are counted in Haifa time
    minNoticeDays: 2,      // orders need at least this many days' notice
    maxDaysAhead: 60,      // how far ahead an order can be placed
    maxUnits: 40,          // desserts per online order (bigger: pay later, we plan it together)
    maxPerLine: 20,        // of one dessert and size
    sizes: {
      s: { key: 'size.s', label: 'Small', price: 100 },
      l: { key: 'size.l', label: 'Big', price: 200 },
    },
    defaultSize: 'l',
    // label: the English name used in order notifications and payment records
    items: [
      { id: 'trilece', label: 'Trileçe', key: 'p.trilece', group: 'sig', img: 'assets/img/trilece-sm.webp' },
      { id: 'beirut', label: 'Layali Beirut', key: 'p.beirut', group: 'sig', img: 'assets/img/beirut-stack-sm.webp' },
      { id: 'balls', label: 'Chocolate Balls', key: 'p.balls', group: 'sig', img: 'assets/img/choco-box-sm.webp' },
      { id: 'cc-blueberry', label: 'Cheesecake · Blueberry', flavour: 'blueberry', group: 'cheese', crop: [62, 73] },
      { id: 'cc-mango', label: 'Cheesecake · Mango', flavour: 'mango', group: 'cheese', crop: [43.5, 38] },
      { id: 'cc-strawberry', label: 'Cheesecake · Strawberry', flavour: 'strawberry', group: 'cheese', crop: [79, 42] },
      { id: 'cc-lotus', label: 'Cheesecake · Lotus Crumble', flavour: 'lotus', group: 'cheese', crop: [25.5, 71] },
      { id: 'cc-chocolate', label: 'Cheesecake · Chocolate', flavour: 'chocolate', group: 'cheese', crop: [64.5, 15] },
      { id: 'dates', label: 'Date Magic', key: 'p.dates', group: 'more', mono: 'D' },
      { id: 'basbousa', label: 'Basbousa', key: 'p.basbousa', group: 'more', mono: 'B' },
    ],
  };
  if (typeof module === 'object' && module.exports) module.exports = CATALOG;
  else root.JOY_CATALOG = CATALOG;
})(this);
