// Original unclipped OSM footprints, projected to the existing campus origin.
// Local footprint coordinates are metres; x/z and w/d are WORLD units (.5/m).
// © OpenStreetMap contributors, ODbL. Heights and hidden elevations are estimates.
export const HUMANITIES_BUILDINGS = Object.freeze([
  {
    "id": "oesol",
    "modelAnchor": {"x": 0, "z": 0},
    "name": "외솔관",
    "code": "524",
    "x": -86.5453928636067,
    "z": -112.92318078816832,
    "rotation": -0.24839182629864467,
    "w": 34.86598774290324,
    "d": 9.204969758647337,
    "widthMetres": 69.73197548580649,
    "depthMetres": 18.409939517294674,
    "heightMetres": 31.4,
    "floors": 6,
    "basementFloors": 1,
    "footprint": [
      {
        "x": 34.80426486714222,
        "z": 9.204969758647326
      },
      {
        "x": -34.849324285110995,
        "z": 9.204969758647328
      },
      {
        "x": -34.865987742903236,
        "z": -9.145309611228948
      },
      {
        "x": 13.31261729752311,
        "z": -9.204969758647366
      },
      {
        "x": 17.601461691756906,
        "z": -9.14559102663287
      },
      {
        "x": 34.78760140954419,
        "z": -9.145309610463094
      },
      {
        "x": 34.86598774290323,
        "z": 0.1267778133992863
      }
    ],
    "entrance": {
      "x": 34.86598774290323,
      "z": 0.1267778133992863
    },
    "source": {
      "osmId": "w246156112",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z faces mapped entrance half-plane; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.56640610442741,
        "longitude": 126.9369560385174
      },
      "height": "Map h is an estimated elevation, not surveyed",
      "floorSource": "https://www.yonsei.ac.kr/sc/349/subview.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "widang",
    "modelAnchor": {"x": 0, "z": 0},
    "name": "위당관",
    "code": "527",
    "x": -52.75631609509012,
    "z": -162.82003700242115,
    "rotation": 1.312105746489806,
    "w": 30.671732373449004,
    "d": 21.299244441448266,
    "widthMetres": 61.34346474689801,
    "depthMetres": 42.59848888289653,
    "heightMetres": 27.9,
    "floors": 6,
    "basementFloors": 1,
    "footprint": [
      {
        "x": 30.671732373449025,
        "z": 21.00212117469095
      },
      {
        "x": -4.561458634476934,
        "z": 21.299244441448266
      },
      {
        "x": -30.636599860325997,
        "z": 20.996456350416324
      },
      {
        "x": -30.67173237344897,
        "z": -21.299244441448288
      },
      {
        "x": -14.670183725127917,
        "z": -21.248368873788724
      },
      {
        "x": -14.742546213790646,
        "z": 2.3849916811725604
      },
      {
        "x": 30.671732373449025,
        "z": 2.31133561760719
      }
    ],
    "entrance": {
      "x": -4.561458634476934,
      "z": 21.299244441448266
    },
    "source": {
      "osmId": "w246156119",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z faces mapped entrance half-plane; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.56724451317453,
        "longitude": 126.93786652097715
      },
      "height": "Map h is an estimated elevation, not surveyed",
      "floorSource": "https://www.yonsei.ac.kr/sc/349/subview.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  }
].map(Object.freeze));
