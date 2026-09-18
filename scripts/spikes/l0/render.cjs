const {Resvg}=require("@resvg/resvg-js");const fs=require("fs");
for (const f of process.argv.slice(2)) fs.writeFileSync(f.replace(/svg$/,"png"), new Resvg(fs.readFileSync(f,"utf8"),{font:{loadSystemFonts:true}}).render().asPng());
