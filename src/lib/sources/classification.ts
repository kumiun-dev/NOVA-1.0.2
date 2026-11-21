export const INDUSTRIES = [
  {test:/家具|家居|furniture|wardrobe|sofa|cabinet|chair|table/i,sic:["46470","47599","31090"],naics:"423210",osm:["furniture","interior_decoration"]},
  {test:/灯具|灯饰|照明|lamp|lighting/i,sic:["46439","47599","27400"],naics:"423610",osm:["lighting"]},
  {test:/五金|建材|hardware|fastener|hinge|building material/i,sic:["46740","46730","47520"],naics:"423710",osm:["hardware","doityourself"]},
  {test:/服装|纺织|clothing|apparel|textile/i,sic:["46420","47710"],naics:"424330",osm:["clothes","fabric"]},
  {test:/电子|electronics|connector|battery|circuit/i,sic:["46520","47430"],naics:"423690",osm:["electronics"]},
  {test:/汽配|汽车配件|auto parts|car parts|brake/i,sic:["45310","45320"],naics:"423120",osm:["car_parts"]},
  {test:/机械|machinery|pump|bearing|valve/i,sic:["46690"],naics:"423830",osm:[]},
  {test:/玩具|toy/i,sic:["46499","47650"],naics:"423920",osm:["toys"]},
  {test:/美妆|化妆|cosmetic|beauty|skincare/i,sic:["46450","47750"],naics:"424210",osm:["cosmetics","beauty"]},
  {test:/宠物|pet supplies|pet products|pet food/i,sic:["46210","47760"],naics:"424990",osm:["pet"]},
];
export function classification(p:{keyword:string;industry:string}){return INDUSTRIES.find(x=>x.test.test(p.industry))||INDUSTRIES.find(x=>x.test.test(p.keyword));}
export const CITY_BOXES:Record<string,Array<{name:string;box:string}>>={
 美国:[{name:"New York",box:"40.45,-74.3,40.95,-73.65"},{name:"Los Angeles",box:"33.7,-118.7,34.35,-118.1"},{name:"Miami",box:"25.6,-80.5,26.0,-80.05"}],
 英国:[{name:"London",box:"51.28,-0.51,51.7,0.32"},{name:"Manchester",box:"53.3,-2.5,53.65,-2.05"},{name:"Birmingham",box:"52.3,-2.1,52.65,-1.65"}],
 德国:[{name:"Berlin",box:"52.3,13.05,52.7,13.8"},{name:"Hamburg",box:"53.4,9.7,53.75,10.3"},{name:"Munich",box:"48.0,11.35,48.3,11.8"}],
 法国:[{name:"Paris",box:"48.7,2.1,49.05,2.6"},{name:"Lyon",box:"45.6,4.65,45.9,5.05"}],
 澳大利亚:[{name:"Sydney",box:"-34.1,150.7,-33.5,151.4"},{name:"Melbourne",box:"-38.0,144.7,-37.5,145.3"}],
};
CITY_BOXES["美国"].push(...[
 {name:"Chicago",box:"41.6,-88.05,42.15,-87.5"},
 {name:"Houston",box:"29.5,-95.85,30.15,-95.05"},
 {name:"Dallas",box:"32.5,-97.1,33.15,-96.45"},
 {name:"San Francisco",box:"37.6,-122.55,37.85,-122.3"},
 {name:"Seattle",box:"47.4,-122.45,47.85,-122.1"},
 {name:"Boston",box:"42.2,-71.3,42.55,-70.95"},
 {name:"Atlanta",box:"33.55,-84.65,34.0,-84.1"},
 {name:"Denver",box:"39.5,-105.2,40.0,-104.65"},
]);
CITY_BOXES["英国"].push({name:"Leeds",box:"53.65,-1.8,53.95,-1.25"},{name:"Bristol",box:"51.3,-2.8,51.6,-2.4"});
CITY_BOXES["德国"].push({name:"Cologne",box:"50.8,6.7,51.1,7.2"},{name:"Frankfurt",box:"50.0,8.45,50.25,8.9"});
