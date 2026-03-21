const fs = require('fs');
const path = require('path');

hexo.extend.helper.register('get_local_bgs', function() {
  const bgPath = path.join(hexo.source_dir, 'img/bg');
  if (!fs.existsSync(bgPath)) return [];
  return fs.readdirSync(bgPath)
    .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
    .map(file => '/img/bg/' + file);
});
