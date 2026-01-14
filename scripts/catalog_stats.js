const catalog = require('../data/catalog.json');

const stats = {
  total: catalog.length,
  withCoords: catalog.filter(v => v.ra && v.dec).length,
  moving: catalog.filter(v => v.isMoving).length,
  concept: catalog.filter(v => v.category === 'concept').length,
  other: catalog.filter(v => v.category === 'other').length,
  fixed: catalog.filter(v => v.category === 'fixed').length,
  fixedWithCoords: catalog.filter(v => v.category === 'fixed' && v.ra).length,
  fixedMissingCoords: catalog.filter(v => v.category === 'fixed' && !v.ra).length
};

console.log('Catalog Statistics:');
console.log(JSON.stringify(stats, null, 2));

console.log('\nFixed objects with coordinates:');
catalog.filter(v => v.category === 'fixed' && v.ra).slice(0, 10).forEach(v => {
  console.log(`  ${v.objectName}: RA=${v.ra}, Dec=${v.dec}`);
});

console.log('\nFixed objects missing coordinates:');
catalog.filter(v => v.category === 'fixed' && !v.ra).forEach(v => {
  console.log(`  ${v.objectName}: ${v.notes || 'no notes'}`);
});

console.log('\nMoving objects (need ephemeris):');
catalog.filter(v => v.isMoving).forEach(v => {
  console.log(`  ${v.objectName}`);
});
