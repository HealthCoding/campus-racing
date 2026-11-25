// Original unclipped OSM footprints, projected to the existing campus origin.
// Local footprint coordinates are metres; x/z and w/d are WORLD units (.5/m).
// © OpenStreetMap contributors, ODbL. Heights and hidden elevations are estimates.
export const EXPANSION_BUILDINGS = Object.freeze([
  {
    "id": "daewooAnnex",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "대우관 별관",
    "code": "514",
    "x": 38.27982593815118,
    "z": -189.8056595441067,
    "rotation": -1.8096093307775762,
    "w": 21.682699765840766,
    "d": 7.789167696869498,
    "widthMetres": 43.36539953168153,
    "depthMetres": 15.578335393738996,
    "heightMetres": 20.3,
    "floors": 5,
    "basementFloors": 1,
    "footprint": [
      {
        "x": -21.68269976584076,
        "z": 7.757872951026769
      },
      {
        "x": -0.9808817805536929,
        "z": 7.7071737436484336
      },
      {
        "x": 0.6150650007045966,
        "z": 7.68148757033016
      },
      {
        "x": 3.02983483381316,
        "z": 7.728597625205696
      },
      {
        "x": 6.134538904177452,
        "z": 7.7891676968695105
      },
      {
        "x": 21.661850105622847,
        "z": 7.637518370457145
      },
      {
        "x": 21.682699765840802,
        "z": -7.789167696869488
      },
      {
        "x": 0.6359146616900808,
        "z": -7.7451984971833365
      },
      {
        "x": -21.682699765840752,
        "z": -7.754452432041617
      }
    ],
    "entrance": {
      "x": 0.6150650007045966,
      "z": 7.68148757033016
    },
    "source": {
      "osmId": "w242897923",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z mapped entrance half-plane; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.567808665440126,
        "longitude": 126.93985540250986
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://www.yonsei.ac.kr/sc/349/subview.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "billingsley",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "빌링슬리관",
    "code": "512",
    "x": -22.066985785188805,
    "z": -193.08405919093522,
    "rotation": -0.2619824312205295,
    "w": 22.56085972404773,
    "d": 9.607152112942316,
    "widthMetres": 45.12171944809546,
    "depthMetres": 19.214304225884632,
    "heightMetres": 12,
    "floors": 4,
    "basementFloors": null,
    "footprint": [
      {
        "x": -22.560859724047706,
        "z": -9.607152112942233
      },
      {
        "x": -22.518887409731015,
        "z": 9.607152112179168
      },
      {
        "x": 0.09171994363314617,
        "z": 9.5306236205129
      },
      {
        "x": 22.56085972404776,
        "z": 9.607152112942394
      },
      {
        "x": 22.518887409526407,
        "z": -9.60715211294222
      }
    ],
    "entrance": {
      "x": 0.09171994363314617,
      "z": 9.5306236205129
    },
    "source": {
      "osmId": "w245623193",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z mapped entrance half-plane; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.567884510412064,
        "longitude": 126.9384206309385
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://www.yonsei.ac.kr/sc/349/subview.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "scienceCenter",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "과학원",
    "code": "323",
    "x": -188.82670311142422,
    "z": 56.86144019082816,
    "rotation": 1.931320349980261,
    "w": 55.853400671096104,
    "d": 22.930401397251472,
    "widthMetres": 111.70680134219221,
    "depthMetres": 45.860802794502945,
    "heightMetres": 18,
    "floors": 4,
    "basementFloors": 3,
    "footprint": [
      {
        "x": 28.10481610107739,
        "z": 16.430009519548147
      },
      {
        "x": 26.35635204432259,
        "z": 15.394050423781948
      },
      {
        "x": 25.837329610360992,
        "z": 16.140343286939668
      },
      {
        "x": 26.337236413714134,
        "z": 16.705594754898563
      },
      {
        "x": 26.462817992263954,
        "z": 17.318118142347153
      },
      {
        "x": 26.422167221823845,
        "z": 18.05636472067958
      },
      {
        "x": 26.173423575128513,
        "z": 18.716160028789893
      },
      {
        "x": 25.74768000878808,
        "z": 19.215029651113362
      },
      {
        "x": 25.113843567373618,
        "z": 19.63544800232131
      },
      {
        "x": 24.094914330058867,
        "z": 19.8164893975202
      },
      {
        "x": 23.30440335362879,
        "z": 19.70685877422169
      },
      {
        "x": 22.159892537764186,
        "z": 19.275376781972035
      },
      {
        "x": 17.944197173549245,
        "z": 16.273106976759934
      },
      {
        "x": 15.338317435006509,
        "z": 19.717922415263345
      },
      {
        "x": 13.631713903893981,
        "z": 18.886137782668406
      },
      {
        "x": 12.154738390049475,
        "z": 18.70610217218653
      },
      {
        "x": 10.916948706563643,
        "z": 18.52204342077129
      },
      {
        "x": 8.234486219422667,
        "z": 19.017895686878305
      },
      {
        "x": 7.1952315970365746,
        "z": 19.56806037196883
      },
      {
        "x": 5.854605231657706,
        "z": 20.287197025327604
      },
      {
        "x": 5.200443404432624,
        "z": 21.076738666148366
      },
      {
        "x": 3.992536921912932,
        "z": 19.867784458836613
      },
      {
        "x": 1.076817152636739,
        "z": 16.884624578598153
      },
      {
        "x": -3.107665028064374,
        "z": 21.995020854962718
      },
      {
        "x": -3.8766408634816667,
        "z": 22.458687983555148
      },
      {
        "x": -4.479384349169686,
        "z": 22.796631921542296
      },
      {
        "x": -5.123988361681127,
        "z": 22.930401397251483
      },
      {
        "x": -5.91449933811119,
        "z": 22.820770773952976
      },
      {
        "x": -6.465824482262126,
        "z": 22.70711700910646
      },
      {
        "x": -7.173824161870502,
        "z": 22.063414270925513
      },
      {
        "x": -7.476405660065428,
        "z": 21.289965197690016
      },
      {
        "x": -7.404661933898829,
        "z": 20.469244206136747
      },
      {
        "x": -7.124825331477059,
        "z": 19.726974484805687
      },
      {
        "x": -6.595035327599616,
        "z": 19.267330498039975
      },
      {
        "x": -7.230081524216266,
        "z": 18.74532780774423
      },
      {
        "x": -9.130381094438683,
        "z": 20.94900390376518
      },
      {
        "x": -55.85340067109609,
        "z": -9.570552207384512
      },
      {
        "x": -35.7619110609508,
        "z": -18.103636641341318
      },
      {
        "x": -4.411510344481725,
        "z": 2.7583668144319375
      },
      {
        "x": 2.5929932270282094,
        "z": -1.006288422695342
      },
      {
        "x": 9.27821918013909,
        "z": -2.3480063189339977
      },
      {
        "x": 14.426703218356904,
        "z": -1.8199689162055472
      },
      {
        "x": 19.284583083795273,
        "z": -0.8363106673660807
      },
      {
        "x": 34.38765200091454,
        "z": -22.93040139725143
      },
      {
        "x": 44.13208517681592,
        "z": -22.930401397251426
      },
      {
        "x": 55.853400671096104,
        "z": -22.18511431970396
      },
      {
        "x": 32.03934487988102,
        "z": 11.036987509790091
      }
    ],
    "entrance": {
      "x": -1.454098909297527,
      "z": 1.5892124974274955
    },
    "source": {
      "osmId": "r3383545",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z photo/map facade direction estimate; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.563541888271416,
        "longitude": 126.93456457710975
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://www.yonsei.ac.kr/sc/349/subview.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "yueokgyeom",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "유억겸기념관",
    "code": "507",
    "x": -25.760813279008026,
    "z": -147.2278328561771,
    "rotation": 1.318008209478361,
    "w": 18.014743001141326,
    "d": 8.943206920241252,
    "widthMetres": 36.02948600228265,
    "depthMetres": 17.886413840482504,
    "heightMetres": 14.4,
    "floors": 4,
    "basementFloors": 1,
    "footprint": [
      {
        "x": -17.93891758501037,
        "z": 8.895765745048417
      },
      {
        "x": -18.01474300114134,
        "z": -0.734247621586607
      },
      {
        "x": -17.953179985642958,
        "z": -8.943206920241261
      },
      {
        "x": 17.993250398001003,
        "z": -8.94320692024126
      },
      {
        "x": 18.014743001141337,
        "z": -1.3019058269630843
      },
      {
        "x": 18.007512797868582,
        "z": 8.895765745246027
      },
      {
        "x": 0.9078885147190345,
        "z": 8.94320692024125
      }
    ],
    "entrance": {
      "x": 0.01609943860576879,
      "z": 2.0614899485751996
    },
    "source": {
      "osmId": "w246156111",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z photo/map facade direction estimate; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.5670352942995,
        "longitude": 126.93836756436345
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://www.yonsei.ac.kr/sc/349/subview.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "medicine",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "연세대학교 의과대학 본관",
    "code": "002",
    "x": 29.284089138129076,
    "z": 185.00872018007266,
    "rotation": 0.7337987179838821,
    "w": 64.70337306421644,
    "d": 11.401941484186722,
    "widthMetres": 129.40674612843287,
    "depthMetres": 22.803882968373443,
    "heightMetres": 18,
    "floors": 5,
    "basementFloors": null,
    "footprint": [
      {
        "x": -12.886187404735566,
        "z": -11.401941484186658
      },
      {
        "x": -11.243149245976642,
        "z": -11.118120137934069
      },
      {
        "x": -9.618131551899387,
        "z": -10.551089129544101
      },
      {
        "x": -9.748515257007362,
        "z": -6.326494026851145
      },
      {
        "x": 32.12325333821292,
        "z": -6.299274090862262
      },
      {
        "x": 64.16859345458718,
        "z": -6.299274090862266
      },
      {
        "x": 64.70337306421642,
        "z": 11.401941484186768
      },
      {
        "x": 36.39991996539483,
        "z": 11.332515358016032
      },
      {
        "x": 16.187369978553455,
        "z": 11.372274813666724
      },
      {
        "x": -64.65381973819494,
        "z": 11.389707805241976
      },
      {
        "x": -64.70337306421644,
        "z": -6.323129765140887
      },
      {
        "x": -16.476226724939913,
        "z": -6.104758600324614
      },
      {
        "x": -16.384268835481112,
        "z": -10.813195695584364
      },
      {
        "x": -14.696179516212737,
        "z": -11.237398505220696
      }
    ],
    "entrance": {
      "x": -2.527608299690889,
      "z": 0.4137587259910529
    },
    "source": {
      "osmId": "r15948891",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z photo/map facade direction estimate; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.561053337004545,
        "longitude": 126.93964012867501
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://www.yonsei.ac.kr/bgtscntPn/wj/17/1475/download.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "nursing",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "간호대학",
    "code": "014",
    "x": 133.61170368300247,
    "z": 34.44855945522454,
    "rotation": -2.3939449446193644,
    "w": 22.343846323123138,
    "d": 14.727773769126387,
    "widthMetres": 44.687692646246276,
    "depthMetres": 29.455547538252773,
    "heightMetres": 27.6,
    "floors": 6,
    "basementFloors": 1,
    "footprint": [
      {
        "x": 21.64901032284492,
        "z": -14.727773769126372
      },
      {
        "x": -22.343846323123092,
        "z": -14.727773769126362
      },
      {
        "x": -22.06786809140837,
        "z": -3.0990068910702835
      },
      {
        "x": 7.513594794900065,
        "z": -1.2975928708394773
      },
      {
        "x": 7.923596790783211,
        "z": 6.8161220164614695
      },
      {
        "x": -11.510782479126632,
        "z": 6.386375833130934
      },
      {
        "x": -12.188567529020538,
        "z": 13.339842859000752
      },
      {
        "x": 22.343846323123177,
        "z": 14.7277737691264
      }
    ],
    "entrance": {
      "x": 1.8745299500002703,
      "z": 0.9198573077124393
    },
    "source": {
      "osmId": "w429249494",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z photo/map facade direction estimate; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.5636808637193,
        "longitude": 126.94187625797039
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://nursingcollege.yonsei.ac.kr/nursing/about/life/convenience.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "dentistry",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "치과대학",
    "code": "012",
    "x": 150.57671160798876,
    "z": 49.84289598492952,
    "rotation": 0.7309719808820079,
    "w": 26.468766143609088,
    "d": 13.069287517344407,
    "widthMetres": 52.937532287218175,
    "depthMetres": 26.138575034688813,
    "heightMetres": 26.8,
    "floors": 7,
    "basementFloors": 1,
    "footprint": [
      {
        "x": -26.41522927356655,
        "z": 0.7495424237946349
      },
      {
        "x": -22.40245111279291,
        "z": 0.7632784667930146
      },
      {
        "x": -22.315413259440287,
        "z": 5.023122223039735
      },
      {
        "x": -22.211155571189988,
        "z": 8.999706511009762
      },
      {
        "x": -17.507706683007484,
        "z": 9.035345972399895
      },
      {
        "x": -17.19796975956183,
        "z": 13.046827232386976
      },
      {
        "x": 26.466008419888873,
        "z": 13.069287517344335
      },
      {
        "x": 26.462972278866488,
        "z": 5.151015916858469
      },
      {
        "x": 26.450167447986445,
        "z": 0.8083846603514591
      },
      {
        "x": 26.468766143609066,
        "z": -12.019037136291667
      },
      {
        "x": 26.463412456308987,
        "z": -13.069287517344495
      },
      {
        "x": -26.336361158416295,
        "z": -13.069287517344478
      },
      {
        "x": -26.468766143609106,
        "z": -9.752961378774984
      },
      {
        "x": -26.353801080636376,
        "z": -3.675876330712038
      }
    ],
    "entrance": {
      "x": -22.315413259440287,
      "z": 5.023122223039735
    },
    "source": {
      "osmId": "w429249493",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z mapped entrance half-plane; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.563523437700646,
        "longitude": 126.94238288565742
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://dentistry.yonsei.ac.kr/dentistry/about/life/convenience.do",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates."
    }
  },
  {
    "id": "millennium",
    "modelAnchor": {
      "x": 0,
      "z": 0
    },
    "name": "새천년관",
    "code": "606",
    "x": 188.70625845827036,
    "z": -109.94869341055565,
    "rotation": 0.5444895858741494,
    "w": 45.80502936013025,
    "d": 24.062250136870176,
    "widthMetres": 91.6100587202605,
    "depthMetres": 48.12450027374035,
    "heightMetres": 27.6,
    "floors": 7,
    "basementFloors": null,
    "footprint": [
      {
        "x": 3.4785897649820967,
        "z": -24.062250136870198
      },
      {
        "x": -10.882298348819408,
        "z": -23.658961574687083
      },
      {
        "x": -10.269018472251107,
        "z": -10.548278679036944
      },
      {
        "x": -18.66628853389165,
        "z": -9.783552253901863
      },
      {
        "x": -21.29224397659102,
        "z": -22.293106914105813
      },
      {
        "x": -35.580953836269025,
        "z": -19.116258331077024
      },
      {
        "x": -31.40631485749919,
        "z": -3.7190053779068997
      },
      {
        "x": -45.805029360130156,
        "z": 1.3411247004857252
      },
      {
        "x": -42.65774282476223,
        "z": 19.626075947382787
      },
      {
        "x": -15.100255952641106,
        "z": 12.914745527246462
      },
      {
        "x": -14.571505264214885,
        "z": 15.444810566809677
      },
      {
        "x": 3.460746593260236,
        "z": 15.444810566809664
      },
      {
        "x": 3.8807367680176066,
        "z": 12.709296637310658
      },
      {
        "x": 28.096358100314525,
        "z": 18.663509850197457
      },
      {
        "x": 44.09590599797518,
        "z": 24.06225013687011
      },
      {
        "x": 45.80502936013032,
        "z": 18.857544912895793
      },
      {
        "x": 30.46203478858552,
        "z": 14.246358706115245
      },
      {
        "x": 32.51995634144659,
        "z": 5.743057408627299
      },
      {
        "x": 27.735466835873332,
        "z": 4.7957097478614585
      },
      {
        "x": 28.868620989313374,
        "z": 0.5421567939200624
      },
      {
        "x": 13.685808383569697,
        "z": -2.8020945891925404
      },
      {
        "x": 3.79968210448264,
        "z": -9.958564271392135
      }
    ],
    "entrance": {
      "x": -5.55,
      "z": 15.445
    },
    "source": {
      "osmId": "w216487503",
      "url": "https://campusmap.yonsei.ac.kr/",
      "snapshot": "reference/building-audit/round2/campusmap-sinchon.json",
      "osmTimestamp": "2026-10-04T15:42:01Z",
      "attribution": "© OpenStreetMap contributors (ODbL)",
      "licenseURL": "https://www.openstreetmap.org/copyright",
      "position": "Minimum-area original OSM footprint rectangle centre; no arbitrary offset",
      "orientation": "Local +Z photo/map facade direction estimate; +Y up; model metres × 0.5 = world units",
      "officialMarker": {
        "latitude": 37.566384491363785,
        "longitude": 126.943189989789
      },
      "height": "Map h is an estimated elevation, not surveyed; model roof height may be photo-adjusted separately",
      "floorSource": "https://gsi.yonsei.ac.kr/sub1_3.php",
      "accuracy": "Footprint from saved map; photos establish visible facade. Hidden facade, roof depth, window sizes and heights remain estimates. Front and entrance inferred from concave footprint/photos; actual highest roof 30.3m is a separate photo-based estimate."
    }
  }
].map(Object.freeze));
