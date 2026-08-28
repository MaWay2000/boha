import { destroyFavoriteUnitPreview, initFavoriteUnitPreview } from "../mapmaker/js/favoriteUnitPreview.js?v=20260827-1";

const GITHUB_RAW_STATS_BASE_URL = "https://raw.githubusercontent.com/MaWay2000/boha/main/stats/";
const USE_REMOTE_MIRROR_JSON = window.location.hostname.endsWith("github.io");
const MANIFEST_URL = USE_REMOTE_MIRROR_JSON
  ? new URL("upstream-manifest.json", GITHUB_RAW_STATS_BASE_URL)
  : new URL("./upstream-manifest.json", import.meta.url);
const CALCULATE_URL = new URL("./calculate.js", import.meta.url);
const LEADERBOARDS_URL = new URL("./leaderboards.js", import.meta.url);
const SNAPSHOT_URL = USE_REMOTE_MIRROR_JSON
  ? new URL("results-snapshot.json", GITHUB_RAW_STATS_BASE_URL)
  : new URL("./results-snapshot.json", import.meta.url);
const PLAYER_KEYS_URL = USE_REMOTE_MIRROR_JSON
  ? new URL("player-public-keys.json", GITHUB_RAW_STATS_BASE_URL)
  : new URL("./player-public-keys.json", import.meta.url);
const LIVE_RESULTS_URL = new URL("../results.json", import.meta.url);
const WZSTATS_LEADERBOARDS_URL = new URL("./published/leaderboards.json", import.meta.url);
const INITIAL_PLAYER_LIMIT = 20;
const PLAYER_LIMIT_STEP = 100;
const INITIAL_MATCH_LIMIT = 30;
const MATCH_LIMIT_STEP = 30;
const PLAYER_GAME_LIMIT = 20;
const AUTO_REFRESH_MS = 5 * 60_000;
const STALE_MIRROR_MS = 20 * 60_000;
const PLAYER_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60_000;
// Generated from recorded replay-engine lab performance/potential telemetry.
const PLAYER_RESEARCH_AVERAGES = Object.freeze({"FKdfSbErkD2UQEwdKQNu9Ljvm+5gIihzifzGpPt+CxA=":{"average":84.1,"games":163},"/wbDjIoc/CQkBIg8IdRoKuZT/rSuqitVVjEKb9mLhG4=":{"average":85.09,"games":16},"0KqbyTe8xOWcasv7BgKRvICKmY+xTk4RbaoHdv9uuuc=":{"average":87.96,"games":53},"up/IV9gTxiDlLsUFSC3uqNAZeHumdSmXrjXVDEPxMTg=":{"average":79.84,"games":84},"GfbQQ3lYxkBX9GqOhPyiLRBb3yO7i9ITtvuVazvL9yQ=":{"average":90.43,"games":45},"ZYBO8icEBwfLWsC9s7H2q/6qunn5gFXLzhbbpxJiJrc=":{"average":76.55,"games":2},"VFv722gcOQy26CYIe5Jxw4jvQeYIzKvz0oAU1yeySWY=":{"average":87.3,"games":5},"4Z31E0mI0jVVvZj0LEicTYJLwSF+aK6LDh/PAWLz28w=":{"average":91.65,"games":1},"FA2oZLV1uDhC6PK09PsP/0agVBgaxteaCgU6DcGkA9s=":{"average":77.74,"games":5},"P0D8lXHgduZB0PiPt12NxempU+J2jSjyzF+bUKTIFRY=":{"average":98.53,"games":39},"vWCs/BhRYwKqVlFAlLmb6z7ZoUTXS+NY/r8L/f+r1T4=":{"average":94,"games":21},"0e5xs9mtjcFyPoO7kapl8YHHoTJTDXXP3oCwTVNsdp8=":{"average":95.22,"games":28},"069QtbeDmJvcoLAKiyJCA+3bniEMLBEUTzYgDYHXC6A=":{"average":88.59,"games":70},"1ew5O6Lu8d+5v1Oy3IEX0jby+uWgVZX86CwN8c2yA9g=":{"average":96.14,"games":9},"BohAN+/lgL2fjpUhNWkGBwNdTAmYx+bEIA/nQdpTUGA=":{"average":91.36,"games":336},"aTsWwcPZFGDuGsrmxPOjfnYFD/ave4jUSiFm0BXHGrg=":{"average":97.38,"games":50},"lb+2HH4nYQUojFZFvqdfrAXAPjUTymCqppa7FjuYyZM=":{"average":81.76,"games":6},"bS1CDNjLp74ouTcp9Gxk9oiHcABOO1plmKjx1ozrnZA=":{"average":88.15,"games":19},"JIP8EbCmsKoRZDx4uQbLS3wYx9o4cK2gZOuGxykliGY=":{"average":89.77,"games":62},"KO0uIM196FDc4Up9sakuFO7i29moVdblNftmCFQOTT4=":{"average":87.58,"games":23},"qHIxif1zQQyomwKbsMhlxt3/zqUs0RhSPzaKbIcFmyo=":{"average":95.55,"games":2},"8mPNtpYvi3+vPygLocjeR8zAcGwFO2vVxY/XsxZLO5U=":{"average":67.39,"games":174},"N2ZyW0c7AEgaIL0PcIlGtAa7uxW61eNHBW0rAVzeptM=":{"average":93.61,"games":68},"ZyvEsFTD7uo6uOH0GGPeH6G0/JKcCpnQY1NFIvt9op0=":{"average":92.71,"games":72},"SOuWLdptVFLY27gNRMsXz6HvbKB2FrHiU1m1ONd/00s=":{"average":85.59,"games":3},"sTkw7ZHEYoWIuKVk0TzrIsc2eVRrq+tgRw7hECK0wtg=":{"average":83.39,"games":37},"c8k21KdpsW3PGK3VXxfPzA59aM8DPtroUzX/ZaTmmA4=":{"average":85.92,"games":62},"BellYIQnOVtBqHgpG2xQjPChFJONhqJbqWf7m3cGvHI=":{"average":77.37,"games":1},"AvouPEBnvLa+62gLoolxyUUOCW9L5be6/EaxUMnXv6U=":{"average":75.25,"games":2},"Mz/UYelwlY81ctPis542zi/DknDEoscbGKUF6enRYFQ=":{"average":84.63,"games":85},"VBtQs3uJ/4Ccr4Xe49SFVwe+Z6ANbuE2AkRuabaHIPY=":{"average":93.76,"games":79},"jvIQz18j5LlcEUfoQk25lkPKtZ1GozxId9gqHdvP5rA=":{"average":0,"games":1},"xh54XYMrSZNQNLkggelK0wnvhac72P835mneocGW5HE=":{"average":88.83,"games":36},"UhYD7VAsCTTcWzFDAqV0yvi3gIyybQ8LI9s/ulA9R8c=":{"average":90.35,"games":100},"pAxHfWy7VvtYOarHIUkWaKaYctIpOfhTNUWMQPLTVuE=":{"average":31.87,"games":1},"yxsxODfrmNFKayA57LKCh5dRuhFAyODojhMmfYg7rOM=":{"average":56.5,"games":3},"ERZPXeDdMPaqE+lU8sDyV0bR+d8Sr+5HWFjsnj/gLRE=":{"average":53.15,"games":1},"nw4/mg9VJxRIyFQysLid6Qt89o1YwgClqftM1QSOMSk=":{"average":84.99,"games":9},"5wLSx+0Y7b0l5wsX6w/2XDuwV7OvJB1zZRFd2HWVU98=":{"average":93.92,"games":14},"Il0AxmmFNMVFft9PUTb844GmWK72tuHq/TY7WaArLbE=":{"average":87.18,"games":119},"YC/q8mIAf7LGTnB/TEwMdTOnFdaoEYQM2RJrL/h9Tyk=":{"average":76.66,"games":14},"PrZu7ctx1bQ/a91asBh0BiRU08IjNH0tejDCvlfVbsg=":{"average":92.97,"games":17},"8gk4gB8h7eO31DZXFZVb/xAOBAgAkNamYga1SUfcl3A=":{"average":81.2,"games":105},"WGROiXOeAA3joiX/a/cOumO0Pac6FKcLe+zXl9aKd8w=":{"average":91.73,"games":16},"edx4l3QEsjpqNuWaD6qqjs9R+0nuy6KiqUB8Uiv/5GI=":{"average":91.61,"games":12},"4ViLGZY/OAbx/hSAY1q4j37x625+nMPQI/hEUiYHRz4=":{"average":94.07,"games":35},"X7+3WrsXIg23fCkcRalpBc5KwJVnC80AOPIJureNFv0=":{"average":94.89,"games":30},"No145dHgw0QuqjE4zSVPr8G8J6Tf8dWdsrjMsb34qxM=":{"average":93.87,"games":69},"duzciAHSQGuwSFslr+0cl7BFj4nVfCapP1I6M+GTmNI=":{"average":91.2,"games":1},"T0/wgyfaijdd79tfIwzCWoB0D2DtA5MJHYyhPI9kEOI=":{"average":96.56,"games":76},"g/mYm2EOByWChLKudewjaTkAVD+c4A2SRGvR06ind8w=":{"average":95.11,"games":27},"Htw6mfTzxsa21vWgnwX5rNqc3Jdj26o+l4fwy0K4Se0=":{"average":89.45,"games":110},"hy9kaM+MNQBuw1CVDT6xQ3DbcNG/o6DXXNrumWMmbB0=":{"average":81.14,"games":2},"4sfUd9Pj8W+jHoJ8Onj2l+9Ugh1mrU0WpwQ1EXsnxPI=":{"average":89.55,"games":47},"DNbnW6qt5GuUEjvHzU1yHZpDvdnJjW1urriks4/hfu0=":{"average":90.26,"games":55},"dVt2age5IOq3s/k+Y3nOFatVYtIIwvar2PNOs8EB/6w=":{"average":92.31,"games":29},"3Ly9fTiY/YRkuu7r2ZCns/ZEYlU1bNyPDz3DUeFaaiA=":{"average":93.13,"games":32},"6S4Q4qg1q3k7pbkVSGf+7kHcaDp7Z0W4isuMx6IsaAs=":{"average":94.1,"games":52},"3SVMim+tyYu9zS3n13nU7qlnIEJgTJkud5wsQ8b0WKg=":{"average":80.47,"games":8},"MFSgJcCL21Mw3xYBl7W9UjRPYwrd+IdhZEZSag2m2YM=":{"average":47.79,"games":2},"eqccNDH3WnhrEOyHIMnxMFbeY2d34AGPN4t9ZznjQb0=":{"average":97.74,"games":33},"07CE9zaawIi4CGAV16MMWNMWgXMaIOFY5s+JITxpE4E=":{"average":82.62,"games":45},"eW0cDT17gQdYCvaJO+4J3iJralH/tkRzv+deSwjdM8E=":{"average":92.93,"games":52},"Z71PNpMOwL2DJFq4IdlP81DnY9hDYTB/TjBMC7+NWaw=":{"average":91.5,"games":114},"vus7wCHmaNT3sWtJz0b6u4KaeP6jdC0xlJBvFPa04E8=":{"average":88.91,"games":2},"nT0EOCUMWJ3XAOxjncWlCtge3E/zRtSI/wDOx3k6S9s=":{"average":24.03,"games":1},"2Nw+mhhaLC4s2Zb4GSELQMXfeIGaam3Wi4F0R5KBqxA=":{"average":90.89,"games":109},"+3UbNi/NjbSi+T8eK2NEx17EhEwJmHLTZFjzB0RcPaM=":{"average":34.12,"games":1},"dv0rnKMEVTrlmk75PjSMvgTXqpzcCrHTkS+4+iR+1UE=":{"average":83.25,"games":3},"Qu/1TAqcjxges5aP5yrtQcY4Zca/fwfXRuzU+VPX1ts=":{"average":90.65,"games":83},"4NufdiXaDwWCdG+2IL5dbjXR9NSmNSg0CZr9UVNXvn0=":{"average":94.19,"games":2},"GPYDgyd+cKgdWi2FH2Ouu3grdU90eEB+41lPAAf7iFg=":{"average":96.89,"games":10},"6Tqd5z13Z/duCrJxxrVuiA8ZAoBuqLmfl5nVJKxqGfk=":{"average":92.89,"games":17},"CLAh6OI5MZO3WMFNEYsxoTOUthiVftkeTHBi7G4wLJc=":{"average":89.17,"games":26},"xyREdsB7dq6ZP0/ZbzSFb+qYKrCglJbLxOOz2PjZXDQ=":{"average":93.04,"games":3},"ZaMs3AZWDkDWCAgNBlnqrPEa838HJUbu2hDK/NhKBMs=":{"average":83.72,"games":4},"Nu1mYTSFBx/yTOdK7s6/2vK8yRHLc+04KBm183uQ4Oo=":{"average":87.39,"games":1},"MyJxII/rUa35CdPLsrUJVg57GJSNHNl3voICdWFlUXU=":{"average":88.51,"games":28},"yD0BZTKkMmGeyZb5OO7RqjiMYvvyuTWOlYCeW9fD/ug=":{"average":89.15,"games":4},"qa/0QVj2N62e8R/RYvPvJkY2+6Q+nGpfg5SAqNKzGQ8=":{"average":97.35,"games":13},"QyI23oubuxL/DN0KZi6v11SfLu5eKwqzklHqc16rD7s=":{"average":58.88,"games":17},"1OL1jt4d4IX4yB3cKKgRtXFnpOD15GhgT52GI/Y1mGk=":{"average":80.58,"games":14},"7WzZFFKzFbKs3p/9H6CrvfISIy+QLoG7QFSd5OQcsFo=":{"average":91.34,"games":106},"d9wOtJeP6ZJktJKcH2hm1cRmUpYOtNC87l3pu4Adq9s=":{"average":71.17,"games":2},"2h3AQRIU/suhNFCHqmjPLZeV0SzbGa/etcKDo2/2FDE=":{"average":91.93,"games":43},"7bNd34I+2g83LTFkhCJYFhE9kOImkgbIHthpOEgr724=":{"average":64.22,"games":89},"MHUou2siznw6J6ovSQtvFFlV0ztacYX+v3HlrMKr0+w=":{"average":64.39,"games":16},"1kSFBPoE6ws0vyJwG8Jdbq3l1ba3YYisyiZGirmPUQo=":{"average":92.14,"games":129},"UKKtBOlUy8+AUFv0T9eyw0YOtyUpzyhjF9jlEAvpXPA=":{"average":79.91,"games":12},"1NFMR5lGefdMZWGVenUAtfnQfH3tDPddMlx+f9lniCU=":{"average":94.14,"games":9},"hFKaF2oMagY6TC8R/53JmPhtvsV8T2znvrantcA47YY=":{"average":96.97,"games":14},"LCdHqiQI8jBQVCsONkUeY8zq68SUNI+abU1Gn4zNDuw=":{"average":79.72,"games":15},"gpWQwIoEAnKdW90uV2WQzd5emEuP9BmuubzgraTC2fc=":{"average":96.48,"games":4},"UgWAqYlCviROq6HSgvWXz/Hmv6Rulib47ggYiapMXwk=":{"average":79.21,"games":3},"HbjbZq5pkYu+Jqt4q/b32rM3FROOVY9BnJMHa+TVTe8=":{"average":93.66,"games":1},"ZVW8eG2cmDuMPNOh8Ar3x/ZfTDgffd3FJyU6Ci56qKI=":{"average":88.95,"games":2},"cCM29waeMqsis1qNxP+q8pVrtRkokel/SHy3IQMCRiw=":{"average":95.13,"games":9},"rd3tKINJ3GiPzYWQFQGtxyR1v9i3wY1x2spdU+ckqkY=":{"average":92.47,"games":25},"Rs3chrXTbYuAmtL3FFXNYo+S+pctvA/Vwa/ulcIDaHQ=":{"average":93.44,"games":8},"/BnX0w+BfirA/w20+AvrywtWJ08GV8WMiTReyzZa9a8=":{"average":95.64,"games":2},"ziMbjQfmGmRgMFSDXw4ApcJJgO4jQPrDYOPndUsTKvg=":{"average":93.36,"games":41},"+Y+0tAEW1LZL0XuCdTiyFwmunOND05BkGSTAdHdwuRw=":{"average":90.65,"games":2},"INBX86qVzJ0dOhxh4H+EdUjgCal8NIdQj+i8UO5zUXA=":{"average":88.39,"games":3},"+HqRwz0ELgW3O78U1+otI+L6VxfqzAZCk1LowAjrZG4=":{"average":64.03,"games":5},"3ShwunLx+tKzCF+J4SVpmf0+ra3tlmepZZIOcgbnO18=":{"average":91.31,"games":2},"s4MF/YU+X3o0p7/1gL60aTanzZFeHwODrzs1U1xZuHs=":{"average":87.16,"games":3},"COYXpTCAgRWeRyILsIbqFlgb3VsC0J/3hqJuz6ADtXk=":{"average":96.13,"games":1},"w6Dfo5a3ACPRX7amQ75PU23jtoFkGaEy7KrxJZhJ3W0=":{"average":88.63,"games":106},"idafAMG3Z6vMbgaX/M+IIWqToDrJP38lrqi0OGmGuSU=":{"average":90.67,"games":3},"Sk7zFJPYYip+v+jTBHHinlLZa2/lCIyo/BidNUg4gv4=":{"average":96.57,"games":37},"8//syTZ2aa7eyW7Izx6tQcjrpKbvvfPWe/4D9qdS8v8=":{"average":94.58,"games":1},"lnHlUm+oG5R9yVSC1cY1txGtqx6StKcG9ysBtLEIZSU=":{"average":93.54,"games":4},"0wc/yBv9MBqw9zPqIDPdgxuTI3KyMnVTAQclrnpKpCw=":{"average":73.64,"games":2},"cpXR+IpUl1lhMLrkWoIiIH9hfVYj8WH2oXe5yb98P2M=":{"average":87.73,"games":5},"zcAYnep3NIM4upyPm/esBjW/GtNwE6tAvD2D5MIBeQw=":{"average":94.57,"games":2},"qy/N+oGPHakzWHDUe7WNsfzpwPlqQTFaw0iXfH38QQY=":{"average":86.9,"games":44},"SKGHvzgWDwEDuntc1mSz/BbPBzMknd9WZlGbo140d8I=":{"average":85.71,"games":46},"Cx04xCaYYGxGrsuQaNNANd1tQpT9kDIDBgESJ6nb21I=":{"average":85.38,"games":5},"kUAyFUOJhm14CReCYSrotvbeAUQUMItPb7pm2lyCLVQ=":{"average":96.61,"games":10},"7EG9IGwzcffLcKZ0T8sT2TkwykLfFL7pTzk61Fsy+30=":{"average":57.78,"games":1},"Jabronir125JC1GxuoB0O3fd4uZx1aCSYNnjFYQFpj0=":{"average":92.15,"games":18},"tynQQ7nSXSKMhAfTJXlKPHFARpLalQYLrf6nyPkixsQ=":{"average":93.89,"games":1},"9+8MPbZB0TxhAfu0z0qMGQbmsvPhGRyDMRasO3M+Ueo=":{"average":85.69,"games":2},"JL/sd91f8SesSozElEWRkTjm701Hdhio+8SNMfqff4I=":{"average":90.47,"games":14},"72hbuGcrjFjR/AnHbrh4vj/eZ1dZFdZWopC25E9gMhE=":{"average":87.05,"games":25},"voU9aukCdCklg1rML1zJlcxc8Ad81EBwYLmfFth9p0U=":{"average":60.28,"games":2},"Tcs1YXWTxTuG1i+6/k2f5sXsCQOPBNpQLV0QcZstSHk=":{"average":78.09,"games":21},"DHTL9BtzA9UsB8dd32q3fH/L87Ec656XqkqvD74BfEE=":{"average":93.06,"games":58},"lyHJsqq02IgpuxxtgFrCffI9aBrMnxeErWimbfuFUwI=":{"average":92.63,"games":12},"/HUdbZ+9SiIF0XTthWINYV+t8mBSzKpjP69h8tMM8JE=":{"average":84.05,"games":63},"yjB1TzR0uzy3rDFZjscTkoQUfyKiK/nNn6nhlWYEFDo=":{"average":92.86,"games":1},"JABwrl5e5bj/Dg1Ycb8JatMPfbvX77OkvRga089LObo=":{"average":91.81,"games":1},"6xDoqA9t1SYQt7CiD+z8UpyEcbUOiw/sbv+FXBAkucA=":{"average":83.15,"games":22},"NtaklRWLIHZNwkkA+888GIYJnhPHpI0lyjpWuW3yhSs=":{"average":95.91,"games":3},"+pGFzFPOc3sqqWQjElcQcmQ9kIy4h2NKgLXyBouuKnM=":{"average":89.09,"games":18},"zYU4NgPi7CWfETRgF6RguhJSV3NwMJLV9GOz6JQYi8k=":{"average":85.77,"games":1},"RIAXDbjpF6b65FgdR5/9ljESn0Ffrn/f2rXCbOnZZ8o=":{"average":88.1,"games":1},"m2gGGtHyl7JHEeu1mMDTDk+JLS+n07lJS4ax9d12jDs=":{"average":88.94,"games":55},"KuiyRyK8RJBgvdY/jy6BRx89EBl7DxtuVj2P7ay8nhs=":{"average":98.65,"games":6},"e7FKsH1jT9tdQl6q3FFScrqzvqJ8nhmRj7joNYekv1M=":{"average":48.83,"games":1},"x0Cm4e4gfCn5VmojgfgEJMVPaly+m1JQcbnPHDqBlC8=":{"average":58.03,"games":4},"W6lIePJVU//PZ7n9cwkQoYJnOOc94NJxzFbnh00ySqU=":{"average":76.71,"games":1},"ipz/9lj5pZFcdXWixyKqHh7wpd8Wh6LZZ/ufB7kbk2g=":{"average":84.53,"games":1},"Cleptodyxe+bxoKzwMvNnnG9WOwfee7saQFZKYO+Z7s=":{"average":92.43,"games":55},"TZvpYcueb5R5zxMHMCKrnh//tQHhgjewN6Kj5pgvqm8=":{"average":77.27,"games":37},"1OvP9VKr+WKp1HdWG9PbOG0j7X6jGzMfAqQVYRwZazQ=":{"average":77.21,"games":19},"Y89n+S1nJCo01KsgGIJhw/VQHb0ikznWcQLvIbGaApk=":{"average":88.07,"games":18},"EuKcgaSio9ul7rpse4Qx5Wkzz9+y2JN/tCQK2XoUK68=":{"average":89.04,"games":7},"e4giawjFw7vx1Szn6pMu4w5jJnHS0hbvJAzHqMR8Czk=":{"average":92,"games":1},"WCwOSBV+ekbo6YCx73DEfUkjDrK93DWn4F/Jgd8yDdw=":{"average":88.09,"games":1},"+9u8lMnxv6pLD1kBtfhapNI7eoWx5v+jJnZ0yWcIydc=":{"average":72.26,"games":45},"PugucxTkxg02ZtDeWOf5GAD43z9f3gQiiWPswmv6ODQ=":{"average":90.12,"games":67},"GdVQOWe1uYkV1KYrmb6aeYcwMr9bFX5ScMfPSDXcaXE=":{"average":87.81,"games":20},"CIeOnwQJd/EqFoAhfxIf9XRC7JZWvLrZJNwEUoE6B4E=":{"average":85.13,"games":1},"F8cOPgMzD7oJC8TU0IahhvZTxkVem3Qo6h6FacxI+wI=":{"average":70.44,"games":10},"mvNF6i+y8r9T5abo8/DgQhgyjg9MTleNajD1TXIXQuY=":{"average":95.79,"games":51},"xI1gIJ/5ZhEs2PDyUMfjYwl9++JrkExDu4W46ILnjLU=":{"average":75.63,"games":1},"pKMdTHg+wS66lVl3NulPjmQS6m9xsXXvwOZQcoleUAw=":{"average":81.63,"games":18},"gpu62zFPvCkaTKfqv4sXyWSDiXd0HOQ8/M1jm7mPiJM=":{"average":87.08,"games":17},"0KV2tsqWBbGU7iDe1x4ciKnF9yEx4nD92Nz7iCTMQ00=":{"average":92.35,"games":99},"tENuFxNmb7/Ruc+IGDpAINbx9u5nIka2Fqk7n71VjqI=":{"average":35.31,"games":4},"EzHaE1wPwHVPXnBWldy3SP2lva85WRIEHqr9+/T08hU=":{"average":65.06,"games":2},"tdBzQX84HoPq5G5gdvhx9ukB8tq9rYxZHFYnhw5tuNE=":{"average":81.28,"games":4},"EFQEo+MegZwwG1VTJUkIaES2Ad5X0qoUzpDGkicf2wo=":{"average":90.56,"games":7},"z11uejhfBIuFFCSjBjoivTocLLHa0xVTZzg/sZiz9oI=":{"average":96.91,"games":13},"AnuCJ+h8a8/+uGBltEI0EIztGnUeLCPeVE5ikzrqJXg=":{"average":86.08,"games":92},"Uc3BCXpbPsHNqb+b/8SHc5D7hxSopJPngk/Uvgnja6I=":{"average":91.24,"games":7},"XiRs8PEu0BWUrh3J5SjIqX1+JuqekxZ7ERrBJH2Uyyg=":{"average":96.98,"games":48},"s3392Y0LB0y0FWT7XKv2hmLNkMlquIFx8MJJio3zdZA=":{"average":79.18,"games":15},"I8f9SfDNve8fAexxdu7OlpCS698AS7DvRNuwHUMS9e0=":{"average":55.11,"games":1},"SKVYTKMZQpYu+sle3qmRb/fzZkqcJdjoDyJisu5e9ng=":{"average":88.58,"games":41},"iDA3kqShSG3SeVYZ2Sr1HljYGd+qQLRDuqNMqGaYsLY=":{"average":90.8,"games":40},"p7QrGH14MFUnvHjZu6SRcnrLJYiMr4UbrtofIrIvLlA=":{"average":89.18,"games":2},"Sp4IKwZMDq31Ji58tzw7A0cKT8MnGLxkxcane6n39JE=":{"average":96.11,"games":6},"joRmKJhqpv6NpltIFJRW7FGkIJxXsD0RIcVIYPmVXBU=":{"average":94.02,"games":23},"zKxLxwJxBYuo3jV5BSBAXXbL/QUeYKeJ55rw0c3l9YQ=":{"average":94.24,"games":10},"/sK+aGuuQmrwFsYvxiFYvviCanaEgGCzsao0dWKOyAQ=":{"average":63.61,"games":1},"LtmJt91XtnkLc/S3tB+xycxr1ZIQhpvpovBXExdSpSQ=":{"average":86.68,"games":31},"i7SD2tpFcMjL93ohqGICfEMPMYQnwAlGRMyRDQ/vKF0=":{"average":88.5,"games":4},"Hy5psQO3WvDSXO781Ojc+eH5P+lxfWr9D1r/vP3sDBA=":{"average":93.43,"games":36},"RjZ2V4mJjNW0wnsczLE6KLbvJpzPiAV+KIYF0ymIcCw=":{"average":94.29,"games":28},"5VuVv5sq4xeVE81uZ9LVewm3NzmAZ1HhqHuYziPh3Lg=":{"average":96.86,"games":59},"DGRQg4OXgOau4YvT+YwQkVVOaQa8yNvN8ZSSn+JgcUI=":{"average":74.32,"games":1},"gDYvaS0ZxOZKT+ghZvHwV6JFVABFK1lMmAEymHOaDqU=":{"average":63.04,"games":1},"TjqPE8YK/vCy8oV3jQ12ntfE5ZdNjg9NbC14OBy9oZ4=":{"average":89.75,"games":64},"pUXi0KLF61QGEdqc017yDAwn/MfVLxmt9itmk0TdTpI=":{"average":84.83,"games":23},"QUEQwAjgqoyJQA0l2NZA7kIMIXA7iHbbVdK+XbAoQFg=":{"average":91.04,"games":16},"/2d8m66O93AEz+XQhcHGgMg+kB4eAvN1uZj5OldzSRk=":{"average":92.16,"games":7},"80orBu3T6KgiRPaUPuY1ZUB6sC1UWNo7NJOfL90SBys=":{"average":93.4,"games":1},"3iD7JqIURVi4ymWqXbMTNQv3Y3HPLHgqafpPDCpbDBQ=":{"average":95.82,"games":17},"/jYSwhK66Qxzkf6LOmSiMhqdC9CA7w2N5zH70DaBitY=":{"average":93.69,"games":9},"28GODRKkZ+sSkgrjxDrVdiyMPH+aHXuhFC9CRMl4BS4=":{"average":78.2,"games":34},"8xqR1snP9lh2LxnbD9lzPfovlaleDSRvYrFxZtnjTpk=":{"average":92.49,"games":4},"YgJ375a6zR4EJdlt9VwpOEEH0EAkV73U9QzhJBJfCSE=":{"average":96.36,"games":13},"/tqazHbJOf0m2ALzP5Q6ncA0/WKyVLtuVCpIRHn48Ck=":{"average":82.35,"games":8},"x7IR1hez9W/OC7D22LyhYfNIt/hFLKFgppMBV1hgGLk=":{"average":72.04,"games":4},"DgJGKk9ILGaMdyJfVEIFuwuh7buifR3N/RcQH/qwpu8=":{"average":91.56,"games":3},"6PXrZZYc4/Y/q8orN17T8sTaBvlVm9K34raZ4TfMaYo=":{"average":92.33,"games":16},"DmEivkKVs4w+2AVM3l2CdR3dmlKHUYMGt7EX8nQWrlw=":{"average":84.42,"games":36},"F89A7YTxN1TqUfkjN42dtmOvuH6IrC0C+UdQvC04ss0=":{"average":86.03,"games":22},"L2wc3sdmaWM4AcNHkEQZtdL/8J7Y/PNvtcuFrUZ4P7Y=":{"average":93.59,"games":11},"FtXR2o0F4yddqmN0PMCf9Mw3PO1ZhHBKsrNOEhYA4Ik=":{"average":75.04,"games":7},"seSxTZ8btYuX1BK8pDew8hK6GjeY0jHaEXLCEJvnpkM=":{"average":20.82,"games":2},"iH7jLciyOQs/zTZDKbLQqJUj1XWNM4yhmutrVqi8GrA=":{"average":85,"games":3},"OCqxG4UzJXg7cKxHXxXCW1ZoXWbotvJ7vB4IAsImuBM=":{"average":78.83,"games":16},"0qSOreLYScz1mJO5jS1EaBsO1a8p29j5+nlcQBl8MEo=":{"average":83.03,"games":5},"SOSgVBAyIFr4Ek4Y6bOmDmBcwy3plJqKlLlXXECnDKg=":{"average":75.81,"games":4},"Y51KyputktKyoeIu5j9LvoNJoojpnyiRZDwhHc3gAvk=":{"average":95.13,"games":4},"Qd1rCuXleTojkxbcURjQPbS6+d17yJ7BwvJJTs/+LOk=":{"average":88.74,"games":29},"nPCPpQ5lfV5TC5zAMEGa6CexgOViUQ4ofDHRnanbyYc=":{"average":61.05,"games":1},"c3mIK3U9VMsOUP1FNf/cVffZdhIVqNJQWGsEMHmm+Fg=":{"average":90.48,"games":9},"0WmXzMN7xQ9G/wCR2p/NePmu/RH8fFpxNTY0vxb4P90=":{"average":68.56,"games":1},"j2ReknTy20U8+gp/9WLiQnBz/T1vY4vnZydVt/SoWV4=":{"average":96.18,"games":17},"CQwHO8mFlyaIoVcJ0b/GQHzjKxP0FBi2W7cQqjYaweQ=":{"average":80.15,"games":1},"r/A1U0O6VPKMcdoEJOMYOZtpkNr7EhlnLz22BiXR0cI=":{"average":89.59,"games":40},"4/2bJ8Hfb868XVw+dNc3dMVSd3l5LBxHV3OmTUBTD4g=":{"average":90.12,"games":1},"mTO7huuN9qfeO5Qp8sTEMLiQkqMQwtC3Vlnf57N2yXE=":{"average":91.78,"games":24},"Oo1gr4Ko3FPUuJXqFJj6D5M3o64zscLQ2QjXYTupuIM=":{"average":91.16,"games":47},"QnE+OEPl7Tdyr8AaHF7GPAmIjzZ0I8WtksuL8kh2VoA=":{"average":93.68,"games":26},"+7TiEUkhUPaDC5lUAdhFl+3warf37qOqyTinPC0t93A=":{"average":94.4,"games":7},"rrQf0vDbWqt9vWTqWK2hQ5VqqTXWtcV2Sh8O0uG+4tI=":{"average":77.85,"games":33},"53PhSi4GtZ7WZozvyNSTACqy4EGK+m0zYNFFyauHtpQ=":{"average":77.17,"games":19},"wt3dqg8/fCOcsHUIQInEwOf1fpPxiDrE+iBeLIwNGgc=":{"average":93.9,"games":2},"T67W+G39X4tzrntYYSPW4fF2d8/qmpoMinp/zPQPzn4=":{"average":79.07,"games":8},"G269CxyKEcQIdWEjV7qCm4S4fpQXbYFn99B2ZwMqYuI=":{"average":94.81,"games":39},"7MiWz7RcjFx1pL4/ucnTTNb0/1/AaTQbyTiyZMQ4iJU=":{"average":92.07,"games":50},"73ezpZ+tZImxVr+0fsMri6ax4cuWtj2/YSSsHLgvb+Y=":{"average":92.54,"games":21},"5c8HmE5RHKIBVpq5eo/0G9GHwRANtAxW8gQENTNidQI=":{"average":93.48,"games":14},"RzafIxEbEcl5qcDpHqhCoDYaD1NerWTY1fpNJYurOVE=":{"average":82.21,"games":2},"lJV/hAnJX41tF9qyseO2NSQK8ybPMX1FpOpXHIs8Xf4=":{"average":73.73,"games":1},"IoumoEG9WIWeYb+eBCEuyIuhIqW84rfsjDoiVDOHvqQ=":{"average":83.92,"games":16},"TiJ9TpIjpsgKL5oSqXQexQPlfgTsUM7EwbQBWwbp4Hg=":{"average":90.37,"games":8},"X6j1Z6YKi885yZVn25FdM7eSNm11QOhYBCTkcJ1y9JM=":{"average":92.02,"games":16},"yTlF12XO+LLO0/lqOvJ/rnbomY6MzDUsZY0S3ySCE9s=":{"average":77.54,"games":8},"QMlZm+GPTfG4oAqRIioGE2Fo66HFetm7UDMCmdFDTpE=":{"average":94.31,"games":1},"5upDlC4q79BcDVmlKu06tMl3tEj+Ou+otyza4Zf1oMg=":{"average":87.44,"games":66},"tzgm5a1TWnZLzeyiGDUwJb8eUynMNQV7bvVGcWpoclA=":{"average":93.59,"games":20},"p/3lN6s0SXhU0yzJd9CGx8h3r/if77eowpWQ/nAXkC8=":{"average":86.92,"games":14},"MmMdb7smLZuGUS61T2hwy1wSa5BptOMfKjc63JXZ0os=":{"average":91.13,"games":2},"85fopmtgPW8ywtJcwAMhYR8lXP3Ymeg7cdKWmPpOLVE=":{"average":92.18,"games":3},"d+rbftcKDfjHU2JtFl28J4fLylin3Q085pxslys5vGA=":{"average":92.55,"games":9},"KH2uVYYbI64XpMe9a+Qn7d8pdppdULomEy3NiedPlE8=":{"average":83.94,"games":14},"aO1eCDMN0t5R3YVZWBcTbYhv/ij4ojxboyEKcaUpsG8=":{"average":92.22,"games":14},"IjwqUY1PMOanJLCuoRHNGO9MDOBzQTCU2jMcdLRHm1w=":{"average":81.49,"games":22},"Y2gF733IBXSePlGS2y1RB2/N0cFm/7uxHwCt+ieYkNQ=":{"average":78.19,"games":8},"4Sdno2NFTDVcV6AxnfNd+dJy0w2PD8fJq+0G0mYIm4Q=":{"average":83.82,"games":12},"qOK6yW0bPSFYhyl0FCDBUQPwIqioACaX8umFEtgXxE4=":{"average":87.92,"games":28},"1kb7RYtxpC6WM41/3TOg+MGK8E+gLdspfE0vcxgSeOE=":{"average":90.81,"games":32},"1ioniUJ5ausrV+A92CcMDpa2Kk1DL4nzMAO3/WbAI4I=":{"average":89.54,"games":12},"RPcKeQMY11a9RdDFu7ZS/n747RS7SlBog1RVwnrnrfM=":{"average":94.95,"games":4},"K7YL0JgC1Qbsx2CUOtprqVjW3bEYFNEh6aYYO659N3s=":{"average":88.77,"games":12},"KCMRouca+ek84uRhaJRwucRDRawcZH1juvfjGZn6dGw=":{"average":94.14,"games":5},"p9ti2T4nW77olfQUTQKmkaR8+FJUr8zuzHNqIxLz5uE=":{"average":87.28,"games":1},"1VtDYdCFIGHZuc1PDDJusCLE44s3qwk3hTmlJpjFAww=":{"average":88.77,"games":1},"enR9Xe5T2aR5Ymf6jxNZWMTJEu2eX5NlhVorIR+84DQ=":{"average":83.47,"games":25},"iDRc2qG2b0+12iCMCKvCCuT5iS18a6d9MPwTWm8X70g=":{"average":87.89,"games":3},"0ij/dfPO5UkDUb0x678iiMsP/BzFHN/z62eTdyfCCnI=":{"average":96.17,"games":53},"tceiGA4OV5PwQaWMlY4CSbWfc9Yg6xPTGzym6wdcZ9k=":{"average":83.55,"games":2},"JFjmVGP2csP6dmGPDGly3JUQfU7uQsNpQkYzpfHHdIU=":{"average":96.99,"games":1},"wDuJ25wOO1kQL13LgNk7IxVE3ZuEe9uacozVOznepPg=":{"average":77.94,"games":56},"+81xS523ymOrNI5qOeh9BFpcF9fIO9ITTJlm8CBPk40=":{"average":76.11,"games":4},"3BtD4+40rgQ5UOkfNfZFwg19NgeDQOBc+zflhqoQKIM=":{"average":48.95,"games":2},"IZkh8VbchbjLUH3nrYkKtPOG70mtBhyoCXqscSOLGHg=":{"average":90.17,"games":58},"ZiXlrdnCGvue7UFYvbw5xc5LlePh5sf2i+B+zqb052Y=":{"average":96.38,"games":1},"EaDWDNn+nWF6hzHe1hyWTnIR5nHjarcxnr5+o8EkfAM=":{"average":73.9,"games":1},"Rz2PC5SuMyjn4fngy3iNgUlYpU8kIsoNP7vxNIbOBhw=":{"average":78.76,"games":3},"dTr3o1UmdFlKYd95yZfSvJVMJ1NLNlUq9WvKlOm4h9Q=":{"average":86.26,"games":27},"W1ePPIzMtwv6ia0gcMxsAdW8U4zlLOWWWmDmwgMphUM=":{"average":93.91,"games":25},"+ThiqsldyLu6RCUIrJhSG2WZYIO55wRM0jcMi3/W5qc=":{"average":36.63,"games":2},"mbUh24EeNkfjcRQ3t1lWoQPUqu86bsjWiyXrVJZOcoM=":{"average":43.66,"games":2},"oa0YL3HZw44NgOGn4ISglDOVl6j9pzG2zzw1uBqdgNg=":{"average":84.15,"games":2},"Jsi9hhSPOFvUnXaluWwkEsQ/8ASR73su5Ji0pIQ2PeM=":{"average":81.11,"games":3},"phYp0s6TdRczwP3kWmDGUD10gmG1leEFLRronwFqQBs=":{"average":93.54,"games":26},"B2fA663Qcu8QPnPqKZd6CJ0xr2EHyM7kLIIBYjMyD5E=":{"average":74.36,"games":11},"7oyuHGicX+gDFrWaAgk8MaGKvModlZr37dqLfiF2Ozw=":{"average":84.18,"games":13},"0EA/D8+5cuLmijD245zG56ZCdR+HIeZMgEvJhSMRPQ0=":{"average":91.62,"games":28},"4q3ai3Ht8y4I2Mlq1PPh4ESGo3zNcQW9haWRFsW2kik=":{"average":93.44,"games":1},"h20HLSfMPMIYztFqAcFXM9GbxR2nS1StsVhd0Iu1Jnc=":{"average":97.18,"games":2},"nnWpgMOL8dSYqqk54EbfQ0IHpsf7ekQyXtFZFtCC47s=":{"average":83.01,"games":19},"R7EFvJM/YfRMez7RU/MIAf4fhvcCbb0F9q8EUQAj2X4=":{"average":79.79,"games":17},"eQxyo3wzcvoevOI2mAarTcy1xpSwc2skwuJlchpFXwU=":{"average":92.22,"games":2},"rxOu8n4/tuU2KEwFaCHd/rGNar6HZVkPFsshgy+/NOE=":{"average":92.73,"games":1},"sKEmr6vQxm3eD/HrC3HsCoiAObm0/c/7uFcmP4I6arQ=":{"average":58.14,"games":5},"BIkjpeBjxYe+LfPnA6aNWTJcKoLUQEElRib90EOOAsA=":{"average":71.04,"games":1},"9VgNxdB0oDtREo0CVfzPZaPWP41N62taq03nRW9VbA8=":{"average":92.51,"games":1},"WZ7ToqqxWzAI5TmSP7rpnBXfOoLYMCGRpuhWIDKyjo0=":{"average":90.16,"games":5},"Evj0/0JW86QTXSUH+gxB+wZ3JmEvEsZ49NU+zPlEw/w=":{"average":90.38,"games":2},"acQznMghZgmEmjBI5XaSzkyIIIG5CriqDVLcjIQVTDs=":{"average":75.55,"games":12},"C6dh9oG2HGOtnKHmqXHBS+4hYmPcfQkAgCKWZOEVlLI=":{"average":85.05,"games":1},"0r1zOOJlYy/mUVNPj4dtc/KYqyW9pL2UpvXFScCoVdc=":{"average":93.3,"games":12},"m/aFO6tQcXcSYwYtY6RJRC2QGar91rsnejnl/hL1wmg=":{"average":84.8,"games":20},"kBDI1y1AhCB6BDPA7hvH/1SL9vpsBz5NHZmywca36aQ=":{"average":92.77,"games":13},"UzuZ6Y0fVdjseRLPB7hvo57WP4yTcu2iTPvsjaZRckI=":{"average":95.06,"games":2},"j/FZqEjp9f7CZqRav8Xit/vET4JmmgpyoKWr99Av+zo=":{"average":89.7,"games":1},"OkDmQ2sJwPRjHJ0yc63v4Z5gmo4CqqbyCzbef2E6vZQ=":{"average":86.99,"games":24},"2hu+PQLAP0sF7yjpP2BvUzqP+JksjIlUul4FzqxG5Jo=":{"average":95.36,"games":9},"nvTS3kjd87qgtcabx6rioQ7SlTynT1GyBB8MNPO2xvc=":{"average":87.01,"games":33},"71HYblnZ8drw0gp5UUesBIuYs3A3aD/wYhVJnJfILZk=":{"average":92.86,"games":3},"NvIZQRWmdnW012G/RfVjuBoFPesnqj16auy/MWtalpE=":{"average":84.15,"games":1},"8zJDB2mqbn5tp+/TlBLpxzL+N5hQsJGijCNq0i5RNJg=":{"average":81.64,"games":1},"GCF/IBR0SV3mzOxy5sGNMrs2erKdYfV6KeKjDlV2088=":{"average":60.52,"games":1},"Yr48RMWgDLBuFSKro7bmalINw/tuPOll3DjVnxgH3EM=":{"average":85.28,"games":10},"EzXMmYCfHtVgQgV5aiyx5+6y7Sd21N48VxlbNExST2o=":{"average":89.88,"games":1},"lC2l+UL1iPixkn7i4Ij3bxSEp+VHoLQrbibBIVuPy2A=":{"average":79.9,"games":13},"wZuu2wn2hetdlKDQG7ZPV1PIDmZSQIK26BckhBK9VkY=":{"average":90.2,"games":16},"GUAececo+HhG6pQB/JeqMS49A2DBURsJCAnAmEixlCc=":{"average":89.66,"games":1},"oEbR5tOOICRZMb89apHGDNBep0xbV/BFd4j9K3h+0TA=":{"average":83,"games":13},"LFWCBK7RhFwj3x6pc4Ydu1TgiHendPkIY5Q/91ta0pw=":{"average":64.36,"games":2},"Ham+a2l7ro+6p7ASVCDsIXlOdh5HLX5zJXTleFoibOQ=":{"average":95.19,"games":1},"5re6x9kPpB+qHpGgtotWovnnBs5sjgyvVZQ0T7uA48o=":{"average":89.22,"games":10},"EZb14IGCK3cF8rSnLWDdQHvynZ8wPADaObdSdfUSUEI=":{"average":71.05,"games":1},"IsV5UlL1ov4OQdA5TxPiOTvfNuP3NHT4K/ECMqFNzzE=":{"average":83.78,"games":26},"V+ia1e90KsFfhnuqxQ5GEH6RMRIZeaQCaimRaNJMDs8=":{"average":84.93,"games":3},"TZeFTyEoCCVLqTLTu6F0FBkN6RXIUtczPRbsvCxNOv4=":{"average":69.04,"games":1},"lvepzOmSfL2wfrHSrzUM8XLchnUXclX0N1DYGIKK8NA=":{"average":86.77,"games":8},"ej1H70sd2z45hCK6ylnTy5fpJ8fyvN1/VyOc5/c5USA=":{"average":93.07,"games":2},"4XjXxbYHKCqu4AqXtLeu2dK6Wupx408YZmm26m5bmpo=":{"average":86.97,"games":33},"F46iyGIfe35vE3djFd+2TYpBdt+e/ZEsCiORdtIZxKY=":{"average":22.79,"games":1},"8Xy72p4g7jtvPjJ9Ts+OMUjGZl58GL3tH6/Kd74sGCA=":{"average":83.91,"games":39},"MxucyKL8XiL7sZwQvlg9tkGI3xwmiOiRdt6twJgUTX8=":{"average":89.93,"games":1},"CbLv9yGG55dNFCZB6CXaVq7YSBdZNWnRawVKUv4L1c4=":{"average":96.4,"games":4},"V7P6cWtAG26313P15v5AcETK8PkCSYRWh5gpcNFw018=":{"average":93.36,"games":76},"geZPxmmZCxdZw2M7DTmshycXF+BRIIza6NrM2oHD4Tg=":{"average":77.3,"games":15},"w9+q0NO+RlIMg1qeNYmKagCCCtoKf8UyOJsSPKn8JPc=":{"average":92.4,"games":31},"TDAXUBciXYJ0yDctA8Mhf9+lVGNyZ8IdM1p7tFjwoLY=":{"average":93.41,"games":7},"gFCQ+aI9H8dmKD+CurJQQBZ6QUbmdJ+j5PX9Gs6VCBM=":{"average":88.33,"games":14},"9GfAbY5tUasMGjRTkhXcDpXaCmllSav/ta79Fn2CVj0=":{"average":95.21,"games":8},"FakeEXPyGcfGBRIbr0GXsuD/V4bVlLFh2m1Z5/1gHQk=":{"average":92.52,"games":60},"7eIDznvzDPm2I0zTyEb00RqVojoNAkSemSixAD9nfMM=":{"average":42.61,"games":1},"rGCjpHC+lfnKpF8plCle6xrlETASmxHmRaMhEMWxKW4=":{"average":16.74,"games":1},"rox+QJcviIuWpVTK4kZBBhcN2oS35J1JU5tKrvZyz48=":{"average":88.56,"games":15},"nSvM9mG+GfbVgPL7nKt1atw5S4lUo9bhatgzjZdB0Fs=":{"average":94.54,"games":8},"l+QPC7S4g25V+E0AcZSVROFWFm/IZGnf+zfC5BnZIdU=":{"average":87.74,"games":1},"wNN4C8BMF6NpGxgIZoCrcbOj/C22Y6yX/KGiZKFU3gM=":{"average":89.86,"games":16},"m+o+c71GFP1I5mEze4bhDIAS2+lUwlZnei2NoAB+CLA=":{"average":58.48,"games":4},"Z5YQiZMxwWmNt0qSG5yLmGbsq3Bcxt3OkyMtbK7SR6o=":{"average":91.55,"games":2},"dSTyZRKXvrbqcq0JANenmq4ZIdFDf5D6rxnNnCY91Gc=":{"average":61.75,"games":2},"U5+Ql3WYdoDoJZQ6pYUwkvimnbQ2cdSb/rsy8D4s6xc=":{"average":37.43,"games":1},"+uLn+QjaOsDgnbdWlCC+w393XZ4ATM9of7baFGJ11ig=":{"average":96.27,"games":1},"xJ1aXBwn5HKak+q6B+rKkQkQ4smGhn2fjmygN9sYrJo=":{"average":96.06,"games":11},"GzSXYpEDD6sgimqCCbU6b/1ZCiHyWcRNV3OH1GdU+T0=":{"average":82.08,"games":14},"vftnZuCb3fQpQ0z+kgTp4YOQ8vkUqoY19ICFYHkpg2I=":{"average":33.56,"games":1},"F23a3ZXCZVG8QZ11y9+078SguQA0Qo8GRN16zEnQPm0=":{"average":57.78,"games":1},"d+/e6CglmAgaupRlnsdgymxrxMaOzHi6wzQeBdm92sU=":{"average":96.37,"games":1},"BcTzVoYrC2P6MPZSPi62LFbC7S+xgu1cp8QPD6Wzldg=":{"average":95.95,"games":1},"npY7f7E3upJrNx7NtjHn1qqibbtWXeakYLK5JvdFmwY=":{"average":91.71,"games":9},"cAAf15wGKy6BSWvn2fWxOqLkzAQiUMjckmENjejoXzc=":{"average":13.56,"games":1},"N5SbLrRDN+gxPRoF386t9B66r/lJuo31IhQqhhV139w=":{"average":96.31,"games":5},"muEaCESPmVYsyjT1VD70bViYIT0RM9TEeYRs+tQQ2Ok=":{"average":96.36,"games":1},"toGgzJ37IHApLig8H/Js+N4J7eMWtRxAoTpyZJgeRrk=":{"average":94.1,"games":1},"2cpqaFuCqgwsKnUumF4IFA8FjfzF+R/sjb4HwktoOag=":{"average":3.16,"games":1},"EL+3QuAiemRJQ89x0C3eMg26pJura+wMTXpsFEUnS+A=":{"average":92.29,"games":11},"ANuTf7U3D7Dcw8pHcx94RNc1UcEPgF5LflotRO+/3ro=":{"average":95.56,"games":11},"HAvq+ak70FV6x8M4Z5riEqIvU/VRDyJayp/RUmpuoQk=":{"average":95.85,"games":4},"qqx3n9VXQM80KYD8AT6csY1VB0zn5tatoDysIr2i//E=":{"average":94.77,"games":1},"Laraiz+JSZ9PDI6T4zFjylWYea59tJcw/PtmoI0SHq8=":{"average":91.29,"games":15},"h6d0eDypVhDNvxZjsvWUWpU1oPpicLAgBAE3C98LshQ=":{"average":92.57,"games":2},"ziA16mmaeZiAVm9knt8GLQlT7i1z8pteEFV01WdUoZQ=":{"average":82.07,"games":2},"UNg0HgI8HZjUMCPN3Ft47SzFqx/zchC+V3LM5zLaGRg=":{"average":79.21,"games":1},"nX/um+4aN9FrkZCvQ9EmmFPu+Q51LJ2MZ2poc/lkL4w=":{"average":92.1,"games":1},"GYXGaIbGIadUUpvPY9ZVwCUqEmqIfAcHCtBK1j2JT/k=":{"average":90.08,"games":2},"ggRyRw1TC/2m+LzsR2K9TFl9mddT0e7MNo4DLzbXYB8=":{"average":92.49,"games":3},"DBwId/v9NtdS9nX/D+1aSRxXEiKMC3UfTYy8l2i8exw=":{"average":71.37,"games":1},"KICxe7f47L4iloL83o6tbvrM38DS8aWu5c16BbAyaLs=":{"average":82.56,"games":1},"W9RpsHgQ+GjQXGnRjzrgXLw5yGx3I4acXZ62P+zDXl0=":{"average":68.68,"games":8},"jBTgLZjNtr4MYmnMhG2NM8ARJ8eaeXTvf/OmiRP50+w=":{"average":26.65,"games":1},"fGSQLnAliYiS/ibOFUCmb2xFllAnFOgYntqCnYYlGug=":{"average":96.72,"games":1},"oGvLs89iWtYfUfIEVxySKsftpmUOSBdhj+NU82sAatM=":{"average":93.82,"games":2},"J9UqiRXgNKu2vpT2gkYTYMgmfflzb8GUkkrVPE8JiGI=":{"average":95.48,"games":3},"B+lViNt0YJtxSCAg/yeAqw0rkiSMAl7Fz0BCc/BK6fM=":{"average":35.76,"games":3},"BpS23SASUqHcb4xPAbTTR8gHOXv/qJHNkrsdPsMRldk=":{"average":57.52,"games":3},"cyb1pUpw89Zldse2NWwdDZpS26M1yRIlb/59V1hI4lc=":{"average":18.64,"games":4},"UHKj6XkHORlGjiHdLHP1A8tri+6YxP/r6ZHh8blLdYs=":{"average":88.43,"games":8},"9iJGzR1GQwMlxbLZ4kWI9dsNZbIxj2rFH9Ihhm265H0=":{"average":91.67,"games":27},"si7iNyDTXmzT2xXV1d5XTJhOzpgrp4Bykc88nvpazhY=":{"average":51.39,"games":3},"yuri+fGZXUlATTlhM7ez6WjVw3+aYv0CzOSzkCjRsHc=":{"average":95.15,"games":2},"kI25/r6YPRgiMqQ1XsXfhXd1AJz92pAHF1Q9HkvfXkg=":{"average":94.11,"games":39},"pbChK19kXPathySzXX78jX22nB8sVUOytteHF+Y2KJA=":{"average":87.79,"games":6},"fPPRuwpOMay/f7FNJK+pCeetHEwKLljHZg0cVKsRD9k=":{"average":90.87,"games":13},"igGQtkP1YHfVYWVjuBviekfibF8kofo7ipQ6IPjO+QM=":{"average":85.88,"games":49},"+ihNZgR3dFTkZUAcUWV9eISNg+Apoyw4z6CAsvIJKXM=":{"average":60.13,"games":1},"pVP04ejptDwd4Ajh8GU/2mE1Vav7bjuGY70FNVWs6fw=":{"average":92.39,"games":3},"HK0Z71rGrsBRriTiUcoJlCLsA6zsIhPc4MA64lNm/po=":{"average":74.69,"games":2},"U+xfC7aDbRavo8QPd9kS6FkRf9lUVsuLUEqjEVb3BuY=":{"average":61.62,"games":4},"qGVjlHYgUNor6i2l4++LngmhjMyGRvWtifjkwhZrkcg=":{"average":86.65,"games":1},"jXSoSejhk6VIa8gXpCey4+kiECpO1hxbkWokOiFgIcE=":{"average":20.17,"games":1},"bRgyVdZ9kZthIk3Z2q8mlAGGZRuVC5xHHif3z1hUxGk=":{"average":72.05,"games":1},"p6/FZGMS1tHMIsijclIoK+BmD1cR5GeucwWLQXlDl5c=":{"average":92.53,"games":5},"Wu073RK9fnvnofNmRigyQpDucF0DvbFJ4HJdp9L2W3U=":{"average":43.17,"games":1},"0dYVI/FAp9hAN/qUvzpAbg6/4OhrncCr8FgxxVuZMdg=":{"average":94.4,"games":1},"c8eAfU0MYSLgHrlGwkbnL4809rV21kX+XW3sOPUvibc=":{"average":89.82,"games":1},"ZGLaG8mt8xRM3NQRkHICjIqjm+bad035qwkb/PYQswE=":{"average":80.3,"games":131},"PBOnOTb6FGB9CdbsPP0HKokBz/UsVHVOzmGg0ILX5GY=":{"average":90.42,"games":2},"+6TRlyNzQdWUfCbEjpT+ZuZ6bXtQcQeNYS63pZj0700=":{"average":46.03,"games":1},"dHoNlVfiUFSUIL1+Vahmr53WOzzlM7I7wleOScTG45Q=":{"average":0,"games":1},"NdLBASmtI/FKZ+oltywbf1Aut7poRZxPuJALtK9FktQ=":{"average":23.18,"games":3},"ok6tQpfWcGf8SpZl+Dc7iqkKIa+XKFbEbSNQlUcSVjU=":{"average":65.19,"games":1},"L1B5kNMpNvEhIcwc3GYsZbEsFr5qBvF1VBb0ijjMPzk=":{"average":0,"games":1},"I1vu9qLDySU1RTk/7jW1E8FYUy6RjXwK6FyZMblB71U=":{"average":93.2,"games":37},"vuuJ7EgrtgogMAlDvEY6f/mhOitawaIPqvEYPz272mo=":{"average":95.78,"games":2},"Wave+8+/ZX23H4GSabgwo2I9V+NbrRRXfgaPTS3w3rg=":{"average":96.54,"games":5},"jaBROnl2u00UWIWn9ky1uNSGx0BmEEKQ0eEG0cFRjeY=":{"average":95.54,"games":1},"VV7Rlr3EvyNSC6evjEiqbE/OJGL5rXi+R3E87png/o8=":{"average":80.06,"games":1},"WTCtD+SdD3Ryxw0fqubsf4uXHBq563o1SNKEsncxKr8=":{"average":63.39,"games":2},"2Id0/dJfGZjqX/8SA7tI1/FSSLVRiPikUQ4uBY6vksw=":{"average":88.71,"games":4},"0HdCI3S89L1WdW54exNU0Xj2nTTcIBxWBzQ9s9keh/U=":{"average":91.44,"games":1},"XdPEpWyNg4jMXDdDfIwSCInfFL2ny5V2kqaejOMPHuo=":{"average":90.04,"games":1},"TezDxA1ps5sjioou4WjheDiMF8OCTTcHu/296oWzsSM=":{"average":88.69,"games":1},"Clsf9phqX2yP8fgfzfLLKTarPNRNgl8LipSOI+Zr+VE=":{"average":92.16,"games":11},"my9FgAMBC9qBlp7G1IsW5arfBQQAWfOQfC92lHI1zgY=":{"average":84.95,"games":1},"d0TGf+EX9wP1YCdTqoHCbaX8Vp0h37kjq07xCUFAptA=":{"average":71.69,"games":1},"dEjk5msOhlDVaIALSDi9WJTTD+reZV1TS4EKl7OvT6Y=":{"average":80.94,"games":4},"E/xCwxeq/bNeP/QCQTuVth3tjFjUsc70zfYKFv2UPXE=":{"average":97.96,"games":1},"a29clAeT7jiq3ymLsxyGWRM+Qv0zkYZnTBYICMS8nc8=":{"average":92.13,"games":1},"P5j8lYSivs6LpcZXx7F07IDnyyZTof8IwB6C5bVIzWM=":{"average":39.87,"games":2},"SW0jfyIQte6cVEDuTE3ekyTTTMY0qEiM1vgdyK3whwQ=":{"average":44.3,"games":2},"5pNN9b/FEQvos90ehK14BSwSknfjRvEoZCdKXM+vyLE=":{"average":98.15,"games":1},"j+Gr7qlZyVqntctUVfxG1Aikv13dDeDVaJl9l/g3Wt4=":{"average":91.23,"games":1},"FqhP9phQCbelH7VJmA/dzQbtMJXs9UhWEd+mlFXR2go=":{"average":92.14,"games":4},"KWsRE9sgsuTWh77OjzzkQTil1AFB0BoM5Bpn1CtqecU=":{"average":72.26,"games":3},"79NCS1AXbSyoL6ige9jOMnuCWSrNH/yvwSX2py46gyo=":{"average":63.24,"games":6},"2+f01yODAXxL4KTTaBV0SHNYckBsrwxSdlwp9LgLMoI=":{"average":94.39,"games":4},"2ynOgR81ph9jK6cmag8sJN/eiV2UNEbVnML0et1aC4w=":{"average":63.71,"games":1},"Y5ECYhcbAH7cXKprUiwv0F5pYN7Xum5gMiYbEATnlzI=":{"average":83.58,"games":2},"1aV5FYbOauqcEJxhbU6mtkX2K8+p72ftT8p/ma0UrFE=":{"average":78.33,"games":13},"yc+BlsrxhzcmU8vdkXrgIHHcMyikwlnhleJgs0CjOlU=":{"average":82.81,"games":2},"9eawzwqnAVZcOW8iDPqPmLCgE7MjNvuZ/4Wv8AKerQU=":{"average":47.94,"games":1},"q3cCz1QDV7D3HY0+ZtdadRqrogRsZaqk1Akh1nZU0Bg=":{"average":70.4,"games":1},"Cgw03yvLIHaWkSlepKm/QQBmdMEqP4p/OLdDkjQgVXc=":{"average":27.32,"games":1},"Dojja+9j6VouIaQUapEYLwcvOkTqJilWAIz7a0rUPfg=":{"average":93.85,"games":4},"ZmJFLomi632SJXhSjHfPFbJPCj/moPmQ+9SxHf5Z2Yw=":{"average":91.18,"games":5},"qaw8Ob/WfKymHdkIu1rg6qtd5KoKiOHpvCj8zxqo5lo=":{"average":74.2,"games":6},"D3bbWoBU3V1RrVT5tZZbTjlBEd9m3mPk+4w6ViOdMmc=":{"average":79.61,"games":5},"BuYJfc64JZrm9an1iKowSL3mmHPPua8WjDbI5LI9JrU=":{"average":59.77,"games":10},"SxO8l1M61MHMKWSS8YjrOnVm/v68Di1Hb39LJ5z6FMY=":{"average":63.64,"games":1},"N8S+uzdJyizkLIG6uyHCmf+Tv8fBoMgELdebp+ropXg=":{"average":14.24,"games":1},"jy2mMMFfzDX4PR9URsvDtL1GhIaGgj9LcwkZarHBcwQ=":{"average":0,"games":1},"hufmwHsfKfhWQU4SfqvlWoxHuG+LcmNBcLvkO/WI93A=":{"average":83.34,"games":3},"3C8mORopav50Q0tdXQWS3n4uwskDW0e8rh0zvEVru4M=":{"average":94.77,"games":2},"XPL1oLx55+WUPQ+DxXwgGsJ6SKgyg/f1cSyZxW5bSJs=":{"average":76.01,"games":2},"eljSmI6Zf+TD4/ujBFMAp02Nk+jEKXBXlQFwEtwRdYo=":{"average":75.28,"games":1},"/c+li0k0GaNFrNtUisy4uAMi0mScLlyQ3o8kD8zwO7Y=":{"average":88.35,"games":13},"DaOJv3z3eqTtLYSt+/vFaQBMEOz7CNztZL6/Y67jhng=":{"average":67.13,"games":1},"sS7rQ7gRDfWpfmGIt+YiSW5KsmZP4f8Rd0FKnR6/z8U=":{"average":96.81,"games":2},"HVIOmbqGFC6qCO+TiP3yllP/HiM2rKjgKKcmuQuDNoU=":{"average":81.57,"games":16},"wCkE9IU1mtTkSOAJ4ghFXwKMuHf7VXRXEwkDZiM5m3c=":{"average":98.08,"games":1},"0tWCOmIr79vXNIJ7l/1YeO6kJr2MR7LWVFHmQ53R318=":{"average":86.62,"games":5},"lMUz9SE95V0XtaShMWnHGfSgcxqofbA7e6sDoQiyL5U=":{"average":42.01,"games":1},"vfO1LMnBEIjQI34Bm+E/WPh6/SI/zJHuJDjP7D6Qu/U=":{"average":79.69,"games":12},"P57s8nEGBjsuKHwsie2x5NuqZ5oJKe1xTzaeHEWFxRk=":{"average":82.56,"games":1},"Bn6nWltJaS3B9IFdvuIh0jA4NZfKcAgPpjOVPN+shMY=":{"average":91.91,"games":1},"MegapNXwL/Uf4AVIOflAzG49N9Plst41lwIykF2SehI=":{"average":97.33,"games":2},"bi8jnRPil0w8Ka/Z2C6PPRo3vfoIlrMSD4AVLmsoeec=":{"average":84.16,"games":11},"6J+hdVnLB1UhFa4OdXOqOW3gtIm90qdNsFFjQbu7ViY=":{"average":83.06,"games":4},"vmHdO0LRAmZruQBlQlwh/qykqMMPUzYkzhwOWAg70As=":{"average":57.8,"games":2},"fEjUqJKfT1C1cWSRFRe59qk5QycrCW3eOVll6yQxeEg=":{"average":71.63,"games":2},"mkq+quS+vJjqLvjExuiIW4dfMPgtL6TvKyoCpGo/k9U=":{"average":90.83,"games":2},"qQNXUfrv5EsQ44VDOosVzUy1M8F0WG/so5oB9pQByWc=":{"average":53.13,"games":4},"VWnDPQI3IK+xZ3vlIfYB/kpJCNPPUjJ1e7+ImhHYUuo=":{"average":96.22,"games":11},"e8cIulKf3y2H8qflih3fQo8cJ4O3cEcRmjawrmf0Gfo=":{"average":86.56,"games":8},"v/cp4RwZq+CEkHsQZb9w9G3eMM5UTY6WPeYhtMyB4w8=":{"average":90.24,"games":1},"tvk2RYCNmKTQ4Gifumd/zO9NHwD5ksp1dNwQDp/ayLg=":{"average":92.33,"games":14},"I3ItNEl1egf1CIlePUK7IPzRSVmTBo0UB0//Zciwluk=":{"average":84.89,"games":11},"26AO7woHjyv6Yv6JlypCQIxoyaHoQSPs2Zr84at8LxA=":{"average":96.45,"games":25},"ybFtPjjjx2e7cZzPUJpvoiaeWECUn/vpKTfOYr6Bg8A=":{"average":84.34,"games":26},"+QGRDetBuW3RM0WdPpn/OkbKb2lvnaDH91DNM+/eY8U=":{"average":96.63,"games":1},"RealSo4P/K/Gzv8ya0ZEuZ/Mg74863T/6LHHPcuQQ+I=":{"average":96.44,"games":3},"JWXARvxAiJAvPJ9GdLjmh4G2yqQhBk3E8PVi2f+eZPw=":{"average":96.71,"games":2},"DXvLvVThfKQGGeyA18lQjrCrZVGCfrkbYmDjIR9C1jU=":{"average":74.42,"games":3},"erUmL3eaKQ9933Zu1Qf3BZbVke1sk4HCV/NYNMHWX+w=":{"average":98.03,"games":1},"PTEadOH6EdcKJv2MR7YVa5ySMdQQgSexhryYJ2doR7Q=":{"average":89.59,"games":1},"Z197XHI7guCNO3MFYy2MefriOKy9nGH5lEfFvjmpN9A=":{"average":75.69,"games":7},"fxiBXryjS/WDe+8Bh7ouCrUK9nVhlEhgLH8K3S8MjBE=":{"average":89.58,"games":6},"Real/NoEGPEtjlFQLtSGpoKiEwfE+3Jh4bXUoaCLcpg=":{"average":97.07,"games":2},"3kaEHYP//5OFUl+MPE/H+BHZtIsF5XvKTIJfCNrlGBs=":{"average":97.98,"games":3},"Sex8rU/rn3XgRP+QrHiRHHZI9Sk7PVTgsZajOdAxpHU=":{"average":92.45,"games":16},"16oENuErTMSB9iLhqhyWfkIG0/e8PmJ0WUBXMWvjzXc=":{"average":61.74,"games":7},"jPmPXel/v7CjprWD4l2j+B2MURoFe2urWezGSqFjBWk=":{"average":78.03,"games":1},"wc2msTVxTnThrO6V3nEh+3907t4eeWrbOd9ESIT7Vzs=":{"average":88.76,"games":1},"BefXnTvuSeknxwycupfZy/FLf9ePCDT4nW6cqbfv8mc=":{"average":59.04,"games":1},"RDfDHxW2vAP9P09Sj+pIiQUtzX3iURXuAOYspdA6H1o=":{"average":86.68,"games":2},"1IHi7rJ3KR/LDD1Y0gy92RGxR6TJ9O/3Ugpfftf63xA=":{"average":94.18,"games":2},"2DWMG5SpIKbKobrVxVlMsnJnnlHMxYt1+tPfFQgoPbg=":{"average":68.24,"games":10},"Ih6g0tnX3T6E7+drLzNutncRdCIIYdFCueeS6hB9PCY=":{"average":88.34,"games":11},"0bPsKopC82ozgUw62g++cn2msCdNwNw3/1enDPmqRm4=":{"average":97.71,"games":2},"kH8QZrHwcRHhW43nzTx1x0lMYjd1B/OJyI2ecAPtfJo=":{"average":75.72,"games":5},"kiYoOtspp1csgKuTYOnaabV85b6j4a0FtR1vLMnBNX8=":{"average":75.01,"games":1},"FH+8YlAwp48r6iC2qi+Tc6yqjJsFy8xlRhQEz7CZVsQ=":{"average":95.83,"games":34},"cpBY2gxnNuVVmZps6FNkrx1yrZuBQpUXSLYQe0/dF0w=":{"average":73.65,"games":12},"+j5TJM+aokT9gwSYKJkG7bWIKEFf0TguCubpp1JhSpA=":{"average":93.62,"games":9},"dy3WDfYg1tN1rxab1bP2rP38m7s43DFREG9i5fT+Cyo=":{"average":85.38,"games":1},"s1t99VxKnnLP4AX4QjIoGyIKprBjh0ybNrtqsYMwx2k=":{"average":92.61,"games":6},"M7Bgdnabf4wGXiNhANrPx9tZNDAVC4J+J/E93VqF6YI=":{"average":96.66,"games":14},"T69tOhc7Vvq7Kfh28/t7NcqttLGZOohghCUcbvUITMg=":{"average":81.56,"games":6},"tplVuFYUq3ajeYVu3mJVJLanBhjpGZuJMgYmMLJ1BZY=":{"average":79.15,"games":1},"6sgtbFa/Jn+9uzNEop9oUcwF9ROUl4DQfBeLs8UDwto=":{"average":88.89,"games":3},"c0tiIjMbgDhiRN4tl2p53M7RLi/xooKSCsxy5jXlWjM=":{"average":96.96,"games":1},"yLHmIiKjdQXXlcVAMpuOlW6hT75V+AIn1SQ5QplhQT4=":{"average":82.09,"games":3},"dHTbZwb5tc+Bphk+lwmnCGLsPp0d7JljqmyyAtaxmss=":{"average":51.64,"games":1},"+s1BATodBmb01LI1RZXt3h/NA/QAJlR77hTwgaAiWrg=":{"average":47.9,"games":2},"FZPU/Wv/k3tOx9PzKQ8wrgdpZwsXFL/BJIyaAM8COiw=":{"average":85.95,"games":1},"KRnVDteajxl8h/+8j5VrLXSlBa4sauNSDLqapbg+3Ss=":{"average":49.71,"games":2},"esrI5TkdsK0AzQC63fdxwDPU+0YVTTbtlDC/+b6tG5A=":{"average":49.5,"games":2},"Stf5vlkxqfYSe67YJ00/upzxSP+zsEFPAMKmM208iGg=":{"average":92.76,"games":1},"+BzhTUySYbniCCDZvzobbyTIIrI6qubiSdqAhRmCLsI=":{"average":95.56,"games":17},"Ld3FRrSvByYjEzooa6d068fsKnwvye4hHNvC+Cl+21U=":{"average":0,"games":1},"1uC8RGH0iDGAMBwHc6ylecoxACiysH8anUCnjHNAM1E=":{"average":80.35,"games":1},"9X70mKpf7dEk0txdCfttdKsTWIoPT62v8vxcgS+4FRk=":{"average":97.72,"games":6},"XFgdYgoSe1qLMGVrSWkdUgEcllPiW0s25KyQ1ThLVcs=":{"average":88.44,"games":1},"tGEQjoA9PvttHDbEsv34YLHz34JO/ELYBRhpA+yfTPQ=":{"average":76.76,"games":1},"zuXQRc/wBiNYFCxrmqKk2CmGkeadq3HZlgdIUYxkhig=":{"average":62.58,"games":2},"ZnTWOYJ/38HnVwiGohkPkuIOmMLRqeTx7sO00JtOjGE=":{"average":77.04,"games":7},"9wrLNaXiNxKeoNYxD1jpNJ6fsdWaWYi0nYc6N/ePXnM=":{"average":83.84,"games":1},"Te7sCwQxKeXsEvfNFHjqGIUbqQf8Lh2Wk17ol6FqafU=":{"average":89.14,"games":3},"jcp6VwcdxZiDYs8QkEadTREGRo6hsMXCXZJOSERAh30=":{"average":89.56,"games":6},"vksiTL3aZ5irhmu6T2gLKyD1cHiM8xwkgwzdYVQNnhc=":{"average":60.19,"games":3},"/IOjW0vGDX0rZaYgxXJYj83IUZ3X3CEhl9YA7qdzsB4=":{"average":79.66,"games":2},"fOHyU7gYejkcuTeQ5kMZ4AWR92hBMonNBJqP1Ia0pJE=":{"average":93.06,"games":4},"LaVtjYhxsvgRqh09j2m9cdLTJspg9RU1B46qhDzBlng=":{"average":91.72,"games":1},"TrUCC1HWfr//QtJEc7n8G8dcAoAgKWLRjqrClxcTeIU=":{"average":93.12,"games":1},"Cw7DVOk2fwZ6cvWP1Owew+fg8m/oXNB56Vme8M2yP10=":{"average":64.75,"games":1},"zdMfF8gW/URO2e/8F9U8C/ID5ENU4Ficw1Vvs4Gv5tA=":{"average":86.6,"games":4},"DRXrqkMf/bEJpd4QAdqhzbaYcRFVfbcitGQnFJCdw4k=":{"average":73.42,"games":7},"u2zueWx3pu3LDKMP3SXP2Kmwnz5ORajQOP95/bzFF+0=":{"average":84.82,"games":2},"pfUJk5t19KXocN34M1FN8puWs0Q0pcbMJqx6LQN62DM=":{"average":65.44,"games":1},"+s1TJ3BKrF94/XekKfpi6W6R/u+NBSWREw8tasPlGQU=":{"average":88.42,"games":2},"VCdRoa+drXwVgOIXn9/wguMJM4VWFBvn7M9kmLAbVDo=":{"average":83.21,"games":6},"vqGlnvr39MLJiA/IfQ0ps964pU/MPjeo3+5ikRt1/uc=":{"average":76.47,"games":6},"Ls4t/rQpbQIaB5uy+wGM3sicuby6rpgM4cGIzrzOW9k=":{"average":85.5,"games":3},"qtrZklkZxrAn3+Ui7u4vUyT9+oGs6tD2AbhJrqc7aEo=":{"average":62.85,"games":1},"Z/LqdyRnvuFv6KSCGphkjsMjFogHAJZjoQ2rOfhqH7U=":{"average":87.34,"games":2},"y3C27Dx6mPbUbS43K6JeZAVEp6XXtvoly/8TRedlsOQ=":{"average":98.14,"games":1},"vPn137ajsgdmtKJRXm7wGAMk4YMtoX+UNwlk9KZ1YPg=":{"average":90.76,"games":1},"j7E4djKsNB5efZqdHyQIPWIUHLAz9gDxBSifO8YzkZY=":{"average":85.05,"games":1},"EGxsEs90OSPkslCW8CnOKELueh3VZUMVcZCPboysVhM=":{"average":82.27,"games":1},"6j1xeNaRvROBghO7+Q/CDsDbBCmOgrTfjKmV1w7kJzc=":{"average":75.95,"games":8},"kxQ9SS/DCcSwX+swA+6mlsgiJeYfHRAODWweA3wefvo=":{"average":89.48,"games":6},"YKcwwSLZMNqJCujSmLKKJXx8ueHaGYmGwD15IPAI7E4=":{"average":43.51,"games":2},"XjNTB1xwJUNsSAEjyCXSYw0LdxwmlGlXOff4gg71DCU=":{"average":81.25,"games":1},"NQmehQWppsjmkgNtt+RpVrpI5oJLCtB+32OijyNlgns=":{"average":90.39,"games":8},"CHYHXdpto7/NLl/UXP8rG6x0dNKokYq2XZ8MWMGvULU=":{"average":0,"games":1},"R+f1c9ro+caT/4GqYP2aiYi7rSQO+GeeUoZihCOY/Tw=":{"average":94.21,"games":19},"dxqNgb64wxa1FKPdcdoAEpXDBQdky9AS3oXPl0P26yM=":{"average":85.71,"games":37},"6U8qgMAtfOtia1uEOhEHAddpVW4zo3bKbRNIugZDigs=":{"average":93.72,"games":4},"sL56oKVPFjJrDVbhEuUU/5oKVTIz9iBg63jJN/9y124=":{"average":95.23,"games":7},"h1/2LZiSN30IEjeRCgJBOOPOIvwrazy2ONFvrrlQ3dA=":{"average":92.26,"games":6},"KiLhcjb0UY7+aVg0n34z+nFaJOlAz7XDXmlhf0ODdY4=":{"average":96.39,"games":13},"nF/nx+Q6eEABsujZqC86bay+6sf/lqnxoHJmJmuYp70=":{"average":91.03,"games":2},"0dHL1QY5t5mVPGrN2FS87ZP+q4bG51ae0gdqpo61UvQ=":{"average":98.99,"games":1},"N8Ss4uWRz7XIQVNb7J1tpSJrpix5Qj5Eads7GpLFKRE=":{"average":85.61,"games":3},"sxOsLHJ3QQxxyMIrobRWmIbhkdqaiTMZjJ4Rkkb3VP0=":{"average":91.68,"games":4},"acTnaG4Z9vNmItv0B640p7xagO3Am7eC9AhQquJ3HVk=":{"average":90.95,"games":1},"6DQ30k5xa6wdqQMKFe7nE7anpA1qotmXLzURNiwkqRU=":{"average":72.16,"games":3},"deTVB95w9BlnuWtsI+Uu2eG+Ry/OYSdf2ieiGqm8GIg=":{"average":89.1,"games":13},"MW2oG4czKN5+h+Qx/qx5pb1sFrWcZ1zj8Q9oxxsH4t8=":{"average":95.72,"games":6},"wnkDZl0wljiSz+qHqlJavScCaGeEF9imbi9YtyLyBTE=":{"average":89.79,"games":1},"jw/uQ606wupTlBDYQ2OcSgAQywS3zShnZ3Rq4OGU7lg=":{"average":85.61,"games":14},"0c+2i8ZJtudu9FyemgttYJbHvYMYTj7xUWvdo8+Nl+E=":{"average":94.56,"games":43},"OYwC1fKxZSOLHgInWidh37NRuemxVPcoFbnecv1k/7g=":{"average":88.08,"games":6},"ORiqa9EtnVQ0yQ2wGDB9SgQDHZ/Ig6EXrB3kwAAiqW8=":{"average":75.83,"games":17},"OGuHzPe7KqG3i2s4J8ZA4ShvVAUm77bI9l1NHpppEvQ=":{"average":66.93,"games":2},"tnHMnlgBxZ1CouXviN0EgGX3icPVn1KzsUm1P6qQI+Q=":{"average":90.67,"games":2},"rwzzMJONQh23DIK43XlYhOb1AO1FmHz/CM/A/LWn1Y8=":{"average":96.87,"games":2},"LATcH3sku2hFdKmWeb/aUfTl2SZ7o2+R8nf2j2NliGU=":{"average":75.26,"games":1},"jgEN60mozZsxi3WxsVxtqhHJBRdLKb/VvPxe3Z1Ldz4=":{"average":96.58,"games":1},"7zjGRLGTqOHstPCnQqXd3O1UqP+XJ3yQVns+LG45UFU=":{"average":89.66,"games":1},"uhXG06VGbChKVlcyzt7T4Dq40gJJelXTijzKMRR2C+o=":{"average":79.97,"games":1},"iA3IwvggF9RksBinXwgJSgJED1uwvlKecAHKzZaqia8=":{"average":83.82,"games":1},"EXVeNAtqPVDtIihiPLztz7Bys/GlSlElbl4lGJBK4tE=":{"average":85.93,"games":1},"LL80RY0HF9CbUAGkdyy7LPPzM6f4FvgPebcSpYGDsow=":{"average":97.66,"games":1},"+8wVAar8JC2triy0B3Vc64Z+DwRlZVCqfNePKr/Zj9w=":{"average":81.45,"games":2},"ak2NK2ihEweXcooYF7dk0b4JeOf+hjCOrN2ePJRkMNQ=":{"average":95.04,"games":1},"mY91FLDKGHaeQ/dbjBGaO2DyJJigqJEOjqlQQ79jsxs=":{"average":81.86,"games":2},"2G77UkNsZP7WendHaIZ+LIBsAISMHlRYsu+wqA72AU4=":{"average":95.45,"games":4},"nY1OHLskQ5USWVwcwBLKzWlSOmL7NcLuRFa/dc9LuGg=":{"average":94.79,"games":1},"RCIgPVmzOAT+u1RazbkyCRB/ZLFMkfXsfhFNO6umVpk=":{"average":90.09,"games":23},"9bL8BinmAIpWeIgdEPiZoyHlq4Ji48Iu938qL5joHa0=":{"average":93.72,"games":2},"e14RYpQZ1PVgwbGmNc2mn8EIKyVt/AOW5T353wT/l9I=":{"average":68.6,"games":1},"WaW7JRnvXc1fD5YD0GTmWnUzWNa+30KultVPwcOubNI=":{"average":88.05,"games":1},"tnZrI6QWHS7ZCzGStWfOwRIsFpAQAuJxJ+xknfIe/6A=":{"average":59.71,"games":6},"pg1QoB6amSJHjSh+40by214lFgpRNuLx5NvhpSWfGyE=":{"average":94.14,"games":4},"GMspfIHP0HSOl0PL1yO3LEfXujA4j62oaE2FyFceJKU=":{"average":94.19,"games":7},"qvSTfCnszQrJNzYC+2QX1shf6X4haw/YvXfmfABeHNk=":{"average":88.17,"games":7},"sLou1kzoIp5rkyeOdVNAQmR6PZDB5ZyUKMiq9rcoeio=":{"average":88.36,"games":4},"dh3JI3mPfoHdlB5o9DDdCqBrwlZJlOi36FhQM1TUhqk=":{"average":79.38,"games":5},"/FyR835rVxdEEVklB+dSVbiHawhsG0gwuyjOZ5F4i84=":{"average":91.05,"games":1},"WDE9eUl7LX9J89Ug/RtaOsNs3jsBAkAurObtn1Smb5Y=":{"average":91.17,"games":5},"WFMxIzNmqdefZXnnkSl255aAc/Rxny6n+g6KpdXg66Y=":{"average":75.72,"games":1},"frZd1E+V+syp0zZCTp/CMf8cZH451SW6Lij2nDwH3WI=":{"average":79.36,"games":1},"/35eNcx2kJPO1gRz3t4haLIjk6QbVSh8MHqma2Q6wlI=":{"average":95.34,"games":1},"d8slP60DIS+0rhSY7XPf8wBSobkGtc3NI84Mz638vTs=":{"average":66.73,"games":2},"xt/jKXkHqMppiRgRJ/I9609NIncuaBjGP/hTtaAZynY=":{"average":74.35,"games":5},"zQ+6c14KE3XJEjlmIL6Bo8dz1oYNzIf0nXW0q1MGliM=":{"average":91.65,"games":14},"yLs4h4alF7MLKYHw7rKRpFhKXTYq6Qi79nRZYPxBOaQ=":{"average":75.39,"games":5},"UrLNOyg9wgeoJmCh8wEB9XpHmHAtffNmjyYwvrPuyIk=":{"average":94.2,"games":2},"QG7u6vsN+DIEdGaWf3KpNJBTks5iFCCx2AEpeP6hEho=":{"average":96.85,"games":5},"pIWp0D7qTiZcfMYa3G9lnfAdVtIJyez6lrDhIEireiQ=":{"average":58.4,"games":11},"mOtE5XVuLiOAtai8dd35kUA8lTox1+tjARvLF755/7M=":{"average":76.02,"games":1},"PMd4bTH1KAcL1dneVmMSvy7ZNjOkIMO6vEBAIyA3lJs=":{"average":89.34,"games":2},"0Dn0HO48MaYYjK7ix7o/jGTX6idlemSUWVn7ld5GLpk=":{"average":86.22,"games":1},"jDhhbNnE1qnCPjIfN46VgY5uM97+PeWA8tWh9JRlqEo=":{"average":91.71,"games":2},"YxD9vv4l1DPHtB902FqNDNboHi6rSA1m2TrlxHjOTu0=":{"average":97.23,"games":1},"l/YUAuQ4tDtUkj9L7G9mEr8Kf8h7FP0vFh2FfaMfHDg=":{"average":91.6,"games":35},"+8hxGoBaNKC1aZ3v+U5UyqarBS1b7oWwYZ2ixWT9NIo=":{"average":86.55,"games":4},"9d6oNyl9B6a8yuq0Vgna2t+HprRxM9DNCuPk2r2Zb+8=":{"average":75.43,"games":2},"WsAacLicbg3VKA7OVJV5KcX8S5w3eorr6CvtEURLby0=":{"average":93.41,"games":3},"XakljSTQFyzK47lvik/KVMnDzXMz/Zyf80mr6ub/hpM=":{"average":92.13,"games":2},"udyLu1kDt4kdPPoZ8+xUsoRN0kHGstH0fcfIccI3YSY=":{"average":87.96,"games":1},"MnU0aDHH5HppmCYDbr6nBlzz/K45rmiSP+8sGkMXkcE=":{"average":82.71,"games":8},"wKHAwMycs74vzVvYHg4IdnEayvfvTvqUQIzbVAW26tQ=":{"average":75.66,"games":1},"5/m2tQ6NEKdE0z+12pNBHF6Iw2OZAVmPq3lQ2poYKIs=":{"average":83.36,"games":1},"yF4H8iKIJj7Sfn5HzrP7tyHV8aqD4q5g2CXwKSeARnQ=":{"average":89.83,"games":30},"iGbjqSo34CxB8pTpWRTJ7rEn+XWlosyuG9zc0thAJdY=":{"average":77.03,"games":1},"pPgDRmus2EmPrO91u+j9B65MrjIuAV/6sRG6gKdJc1U=":{"average":90.63,"games":3},"IwkdrDx+5gPPwYF4uIaFjWeM6h94k4zZ9TRwAsFLkE0=":{"average":87.93,"games":4},"0pGyiPBay3eKJoVuMEhhaDJiWy8qMmoVbLPJs39SZqc=":{"average":94.67,"games":5},"czMvqo1uP/zZyrDoeC6bj+1CwyyxbniFUJUs01KoUVw=":{"average":92.98,"games":2},"Ezbx3m6azN8v5D1DRvP3eb1NrllP63ahD/s2Uga3DB8=":{"average":68.08,"games":1},"DimzuU/q+P59jk+T825SDtnhYDIgvVIBDs+Uc6MkS1c=":{"average":57.61,"games":1},"scbb6yUgxwIPmt85hkl9wZhQmxAZQ3/5E/5LmUKiNiU=":{"average":37.22,"games":1},"SqUcsbz9UdmotXMIgWkZf/rT9yA3GbQx4bUw6DWILP4=":{"average":74.98,"games":1},"wYzpJ8o3vTQh3NF1IUkZ6zA5CLA1XFjcl+Z8+b5xbOo=":{"average":96.71,"games":2},"OiIguT0+qcI6tp5suRhJXfwWGWaj9GZZ0JxSIVTn8hE=":{"average":92.83,"games":2},"pc0d4sLEiJnVQrpFXskAnyY5TcjNc789hVjFHDZTVL0=":{"average":94.97,"games":4},"Vl9iIjWMaLuknCx3A7tJOx3oIcQFPV3zCjHwssmoQj4=":{"average":96.29,"games":3},"ynVBmHfROCYFaTmXrvex2kNi8HWw311liB+JHGn4hWk=":{"average":95.82,"games":26},"UVs9elWvYwpFx8ny5gVHjX2eaL3oTqyILokbtIN3nKo=":{"average":92.51,"games":3},"zd3kdsN0G8EcVqps9BxO2SWCMvyy5bB/0Fc8EnfXq4I=":{"average":86.75,"games":8},"BqyQxGr1n/OA6AP8RRPtBX/Fe80eQ2h76eTYT/kf07U=":{"average":92.25,"games":1},"PdRZF127kdykn8ZxHLViwimAzEAZvSAMVMobQrH8940=":{"average":90.12,"games":2},"PMm83YwA3ZotaNLNID3XNdlioSGkRv6f+Dj8nmnjU/g=":{"average":96.21,"games":2},"2epYi/MmrHDo6ILrdxNEJv7/hg6jQPQ80sTbObgLmcQ=":{"average":96.58,"games":2},"2duywWkblwwYZY5sFqeZdTnU5HBNo1IwGd2aGm4zqnQ=":{"average":90.07,"games":16},"vv2kupNrQWHycp1EgZZBT48ia8L+K3OAfi6Uzzz7tcc=":{"average":90.8,"games":2},"VJVosMJA87UlQRPTTlDa3JDR07T/lPQRl2f7ARS6JRU=":{"average":53.57,"games":1},"enWk/mSye6SdIGvIhCiK1ztk01QEG5iCXhxilihfmbA=":{"average":86.59,"games":1},"Q5F3y6BOdsjtUWflbZZIFpmCOmoDNV+U+y+VybBgu+E=":{"average":58.43,"games":1},"Jv4sRz7ccRkpddTMIStapgKY8rXB2xtbVhQ9vZ8gjrg=":{"average":81.1,"games":8},"P49bTeaNLNIFSX883QbZ5jGXyND7sjPD0mJKD8TuTOc=":{"average":96.75,"games":1},"CnoNDHKGH2m88irtV7xso2CwQHjB1+n+6v0j1ZnuSDk=":{"average":96.79,"games":1},"2R2NRNBc1jnEvbjTqTSc2hV+yEEpavI5PQ/TgwSDdTM=":{"average":60.72,"games":1},"owgUat4NpTp4yqubqejb8W4AFatEQ5QBmfLBTSE7W4Y=":{"average":9.98,"games":1},"HfcTlOscQ6KqZ9+LmhY+3I8WCUxCOgaV7/TQ0JinBJE=":{"average":86.35,"games":1},"Yqo1TBn7dLMM0DP/KCjdU3+qgOzQSekeOZvHHvZ3R8g=":{"average":88.65,"games":1},"Q9e5UbtB1wRxZCm9rwPXQKaoYbUvaSDgEIhW+AP/08s=":{"average":97.38,"games":1},"fEtrNr/02eW+j5rzunJgQ7mjfF+pOD/+u93DMVGeHYk=":{"average":82.73,"games":14},"ZBzvQ/iJw1Jix1MSIkGUuMwrvvgLIW3G8EqpEXvg8ZA=":{"average":71.02,"games":1},"h6FM8W9fk4+xCbLvZg0H6AjOtXU0/G6nyn8jH46ZUxM=":{"average":96.55,"games":2},"eNXZlYBOfzloRd1K8Rr3ONieqBk9Dc4eRVjh51WbvLQ=":{"average":62.47,"games":1},"sDRfSybfjsq80W1BJyKBUX9Qda64+6e58VQEU4NaoYM=":{"average":88.97,"games":3},"sHv4wmrVT42tvz6Hb0ce27531tNv2eO8Fzg4Sm12t0g=":{"average":81.67,"games":6},"Konig+XB0zduegEwKVrNC9C42tMjwQIMoyCISxkzt1g=":{"average":97.23,"games":5},"291dDg+y4Fk6QohmMdrUgIxPGcXgXEk9a904sVHpL1E=":{"average":86.42,"games":11},"aRXzeUN6i7K3UPwH80cxQ5XwRf29UUan2L8H1w7Ijfc=":{"average":48.37,"games":2},"EVGPiJUocszpoLcAdJbwSDWUMq2cBp4AOEZutDFuztk=":{"average":96.76,"games":3},"gTSGEJmugYGbu4D6AZaYidoWTma6Wu+Z39h/2u1eT6k=":{"average":97.65,"games":1},"ADYxmUv00mCUqAoQXS1N+OfwtzJ5euAVYyVi19qolDc=":{"average":67.62,"games":2},"qlV/VWaDEIMKBQsKwtHRaOfDBKKQ6E6YIyljqAbUPtk=":{"average":81.1,"games":9},"XVNETHZLpPWfWPc6N2mVq9YRRCR9FbrIss/USpGRDaQ=":{"average":89.08,"games":1},"xZn5p0C89ZoMB/rAzd3qRorAH+xqva9pxt4k3T2WrBQ=":{"average":72.22,"games":1},"mRX+c+SA0pb1YdT89cBfRMRodEZFy0PxZBuSG4Da+LU=":{"average":75.62,"games":1},"G471bfC5ZgS1Xbo3MWDAZZE1dBKDqnBJyRKMgt1MUd4=":{"average":93.02,"games":4},"Hjbp7BofpBtlmT4qg+0BXikUqsIOH1bcGaOB9HxjxtI=":{"average":89.34,"games":1},"DrMuq2uJugcgUQ3uXd+fns5YT3xLixT3I4gbs+d3Zbs=":{"average":92.71,"games":1},"D0WCtgcpVUzaT4sdEqw2UEFu0lrTGBa/U3DHLlxiwHc=":{"average":91.69,"games":6},"w3VueEpciaSyIigsZQ8bu1NIlIXQrxw4hEYaXaNcqiA=":{"average":88.62,"games":2},"5x5DX1N1HuvdBoEKBrlSxxGQ9bbcHrjN3ICbVdPIXKI=":{"average":87.62,"games":1},"sakZP/gDoGR1oNg79BGqCYhBYLGnGyzT30COMP9P5zA=":{"average":95.67,"games":1},"qOgF+UewEzFbBpsqg5v8HC5He+MOoNaz3YiiHkfDY6o=":{"average":95.21,"games":5},"/lblglFFAkVJs4hLs2KJnIERv2LFmywYOYB23i4hGBs=":{"average":48.2,"games":2},"edadntJbuajz6YTb3GNmKH3EtJWfXYo2BN7yDfrujBw=":{"average":69.46,"games":1},"/nheXG8wUO5b6qFRBcmXNYYWz45Ijf/X4gojsKUdevk=":{"average":92.84,"games":7},"v1P711yr0du/hJj6VZHD4wFA3JhMwlWCCWjZlStjrC8=":{"average":92.34,"games":1},"u0CUoAUjnUflrIaEfxwPr210BeHPnNk8d0YCqUJIl08=":{"average":92.66,"games":1},"j7yUnLF/nyFHL4+ZELrWlEah5gxOg2543t0vs45/zeQ=":{"average":95.1,"games":2},"pMpnDopQqKx7MuhOvO6mxCjj1/Klhd8m1nfbV4xQRrI=":{"average":95.92,"games":1},"hPM+mBGYph4DF/6H+2ewuswmIzXPtU6oo8iSu5o1NKI=":{"average":79.23,"games":2},"VW50Dw0xtlgpLP6rSP+8lKTTKrwp5Cf0MMY/nqyzsiY=":{"average":94.01,"games":1},"OGSFOSyWT09VjYonUZkr2HTq1SXgaWQDLUqTbm08q3g=":{"average":96.91,"games":1},"ohTSN9Xc1E31PDa42hFZL2r6Ggha4NgQlul3Wc2PH1U=":{"average":77.58,"games":1},"vgxFWN0GbS5zN1E9wiUfk73QJcOqLc2e0jz0OCimSDw=":{"average":93.14,"games":7},"9iEApEL424fPZI/jnRXPi2ZlUl8ef+JG/S6t8fgT/Ww=":{"average":78.97,"games":2},"QT0tS4hxOP7KjG1UoxQ/Q9851ot0+AIB4RWYfp6WTmE=":{"average":93.59,"games":3},"UXRfEDaX5NV3rNCVYFYSQdoOvxAbkoYqxTVESCyKy0U=":{"average":91.36,"games":1},"CQ05KT0oWnc4Ov4QEN9vM/zHxlrE8WDoG+tYl7fwoPo=":{"average":91.56,"games":1},"zmRMH6L0iuVpRE9hqqmMthU5J4eIzq68KWVw6xMGVe0=":{"average":86.86,"games":1},"0v/MFg4a5whawJa0e94OsnxjtdZaAq/pbfa5FHtLUTg=":{"average":94.23,"games":4},"vrJ9vim2Xnuo+D/k1Y1c4ziy7GQbB5d8CfITuutAyNM=":{"average":79.75,"games":1},"klP9PmMuLsw0JSpVZrSKdemBoDonNY4SqBHJRIO69og=":{"average":94.42,"games":1},"hr0bbI0Zc/g9iiGybxCeYNR9DXEaTT0i0bs/vWcRaHc=":{"average":92.63,"games":6},"9iYCLct8upQi/cpxEa/DR5wma5Wl5PFiFeEj+Wb2afM=":{"average":89.55,"games":1},"HwDtr0lf0DkmbKK1o0a2elAggDtBYkZ6KR7jdSgr8t0=":{"average":96.43,"games":14},"55R5vE5x5btvLMYkfoBV6tEgaX08Hnej2POlGQnpvdc=":{"average":74.17,"games":2},"ZOabuZ/MeW8102T/xlEjK7S+8CyWhPlQmT4VXqTibZM=":{"average":91.61,"games":3},"WNtGc2Lte1j/iqCXRcBTbaqLCiyhElo1Co1+K3R05Qo=":{"average":98.02,"games":1},"wdMA0x1RJb4VpxkuvHBskTIPhqMLQ2XlSD17ceE7scg=":{"average":54.03,"games":3},"QgFoz++8OX5SGu0HYIdkiE4q9dbLzjH3XXakzrmKiwg=":{"average":82.63,"games":1},"DmobIb/tyK99niDlgb8mxm4ebwPQ9bRpXvnYucOkpyQ=":{"average":86.73,"games":3},"XNkL3JdVVjKFhlQUTgyY4kRaCwuaqTdKNWARjDWV8nw=":{"average":88.07,"games":2},"WYN1HWqx2Nyv9bb80Eep/omFHEM5LIUe/6LnTQv3Mjc=":{"average":92.07,"games":24},"0odjeNOBv4xzFBINPDb/kYywFkJjWyQ0mZlSKfiX1QQ=":{"average":67.58,"games":1},"BKhzucenzQXc37yJFo1UBPwgMUAsht4QRSwG6sJrn6E=":{"average":86.69,"games":1},"ZJwnpeecSt8GZjj23hlo/PlG9mXz/zYfIQHEfj0i5tw=":{"average":61.94,"games":1},"cEFP4B9vcN/yz81C56i/uCMq7+fdWVBYJnTSiz1ibx4=":{"average":58.78,"games":1},"6KI+ZobeH7KYcRuUmuZqAUhFya56VLKqZZ7dwm//sJc=":{"average":87.94,"games":2},"y701GPt6tjAmQya26++olJeERwkgOcUk3wbP+xWdFmM=":{"average":86.56,"games":1},"CLTzvTI4MQI8rIT2a2ww1+QIQh1VDXQHbLnoPFfNCbE=":{"average":85.41,"games":3},"fF7HtdAfs6advKEbUys8GbHPWYrtuSjhIFPxL1mV/P8=":{"average":89.02,"games":3},"mMXogwwYOkyCn6KqMmgvxra8cRKnKsbDC+poVvELAtk=":{"average":92.34,"games":1},"xx0SQor1mwoz/usvJN7Xa5dGywzmqAZ2EaWQ5KXgWP8=":{"average":78.21,"games":2},"jhBbF2qDSQxGWABC4F7IWxogAX+IiQVis4/DLKaFRfc=":{"average":88.05,"games":2},"kKNeo9mWqg3lDpJMLEpvpjOvfAXh9fc1z0ss6D9G2RU=":{"average":80.66,"games":1},"SV9J1AfTqfrbfWbYDdjVCwvLi/MTCpSypkOGg8+ip7I=":{"average":95.59,"games":2},"Du6ZbIffrC8xB8WScaHe5TMf9sufJ9BSznmdu07wmBw=":{"average":94.49,"games":2},"TiC1K++0RFItwoFqiZxdjQRhXSaEPShQP9M3mkeTc4Y=":{"average":56.06,"games":2},"A5ATtd2gA3kgHbBs9yHGgZuly/oL3hrrNP5+SeVjXgs=":{"average":96.03,"games":1},"TDAJ2eodyf+wy4spuG/1MA3yVrpODe3wz9KYzWXw9mk=":{"average":90.08,"games":2},"rLHAY1FhBuDSbzITPR/dOqq8ucSxaHI5skBlwkp6Z6U=":{"average":93.98,"games":1},"AYzFPCe0YXv4wtiY+8u/LYAuSumYfroyDcD7k7P0Kdk=":{"average":89.76,"games":1},"/wU8LpXmy3j2KHsV7nIBOfg85zTvRlvzGloPzfzniek=":{"average":92.07,"games":4},"O3/+mzvEJQpgRK0G+QgzYwKtoVqaWQvmE7CWFR42bdY=":{"average":76.02,"games":1},"Yc87DFZkVUCUUpLRKV6OjqAF+/H903x7Cy7NrkV/mpM=":{"average":93.22,"games":1},"dPIGmbFRVeA4HJ+ddSKUSm5a7MGvXyb9eHg5ixn4Fuc=":{"average":96.88,"games":1},"r9iGGK3qwJiHGhw82ln7PCwCqmUPM55Sv7TWPhhZnOk=":{"average":78.69,"games":1},"zsxAOjmJ8+hSkJ87+nRUEmevFx3kMErz3V3xbrFyD4E=":{"average":84.65,"games":7},"cqlGisZ6AUMEwcOz2uS8m66j/SoDcbMyrHBbTojnOZY=":{"average":93.16,"games":7},"SKxThrqzlgfeqWkOp3JrIogaDMut6kXARInVffdbFro=":{"average":94.44,"games":3},"KFPZVwSTYKmsVkcOL2oJz+fPUsIHS8KIevdxOGNzgkE=":{"average":91.89,"games":3},"NEiAip4yy0AdjGLbFjON0nz+fH8Gs/Th/2zxPxeiKRQ=":{"average":93.12,"games":2},"rZ36j86Zv6juKOfjTQgNiWwhijXVX6fCOkFIBtDLsiM=":{"average":93.36,"games":1},"VNci9mB30Gvq2RAakGSjj2qUki8unuJDIywgMSLFLlo=":{"average":96,"games":1},"tPvj96RE8nvrXrmQ7t7J+IdG5yJsDTCbKXxTOwBqKzs=":{"average":45.82,"games":2},"4oKlI/ffY9WYfXnT6SWTysWkQ5FjSw2/m0MEJIOW8BI=":{"average":76.85,"games":2},"XgAOTH9bJMc5Le+qGT1FGJv6ewXPXWkcb88YpEI/rHY=":{"average":87.14,"games":1},"rMARu7SIbO5x9QF1rJbQLPEkFcbJQYwmViM5xhUPSvs=":{"average":51.66,"games":1},"zo1jp9q7g28TU83ZcXw+TS+9U+M3K8rudsRJu6a0a68=":{"average":89.78,"games":1},"Mjw/hkUCeUTc80ySKPH46DguJjvxANJyIY08Mc6QPow=":{"average":95.48,"games":3},"XNbjwMOuvExjrgJ8z97gfBUQSZlQPE4gJCSJ2/iJWRk=":{"average":94.53,"games":8},"tQZu7CVO4HbZ2IZmiLQuoNYy2EhGk6goLn93dYJQHl4=":{"average":93.81,"games":3},"N84g1qyUU/m3yYkXCeMx/YEJT4GBdRw7fgw1p4pqi7A=":{"average":96.69,"games":1},"TDnnE8qEquYBzC4qi8NUM4QqPU9a85rYm0I1Ohl71KI=":{"average":86.79,"games":1},"ZRPJz9HdumkGmWkFG5LyaKXmvWr4SNfHrks2oLEoJj8=":{"average":72.88,"games":8},"SXcXPcn6oGzl2irRogxvkAeODUeuEbJFJkPks03YRbA=":{"average":84.93,"games":1},"LPQqfUBjBvG8LimBjkMk6w3yQewFM7cVkwsJFc0hWyU=":{"average":92.17,"games":2},"NcsRB5IsuVpzpYFC4Sd7U4StYDdRP7I/YOtuJGH7vyA=":{"average":57.69,"games":1},"85x64UYJtLez1bHO4e4nEXoFDNuJta5CaDHFgnwMPic=":{"average":97.9,"games":1},"DLRX3TzNNK5s4GQp6AsmaOEUqMCE5U0EhKO6ncf8Ewk=":{"average":91.28,"games":1},"YqcgnScEGHrdI5FoSYAk4pWGhClcnesHYPRqysBPOPQ=":{"average":92.52,"games":1},"vYad039pwZaBKGaHaMKdNzRV4EHetK9H++gDlZkV/LQ=":{"average":94.3,"games":2},"5GMNvcaoXp+VZ91gS6AzBsoDzs+ZHsJpi5HpOpLbMpc=":{"average":83.34,"games":1},"z1vLeM1t9Iblh2gdJPfRNkBhh751ESfr9OrzDIBNjpo=":{"average":93.81,"games":5},"sM9Ldz9pqqSHdqd4kY8SEPbXt/oEf7K0JAa1QBT9ul8=":{"average":91.41,"games":2},"GIryt4DUsvzyxuwStc2tO33eCXK6uSyttophqBUmEMs=":{"average":74.04,"games":1},"abpDEFAHJAF+EhFOukdtrugGqNcy7WwidMd/vm79Hw8=":{"average":65.56,"games":1},"62HGiI+D6lgra3PrfX5p9CceKhP64Np7luGw3pGbUqU=":{"average":94.89,"games":1},"zp1PcZWVXDEJMEvVZfG9v1HgGe2icHawUvurL3aqq5o=":{"average":0,"games":1},"yXouR3V8BL/lh1saoU+8kUWufV7AdfzENFgBqrsc3Mo=":{"average":96.53,"games":3},"sf/M7USJd5xjl8saLgXoGbTOkrVqswUDjBVsA/Mo/wM=":{"average":80.23,"games":2},"a9eNhgDpbABospUVqtrL7UQzY3zRtJA3bKdGy6Pd3oA=":{"average":89.81,"games":1},"4DrE0LluPtseuC4Czq+igN0Wm8MIJinMaV4bO+WqS80=":{"average":91.22,"games":1},"/KwuRhC6w9Vlvf4ouNGbmN1tuU9CnMyPFHfvOIQx9b8=":{"average":84.31,"games":1},"8cSORbFK+tR86qcm11uLmCNRxRTDH+3JBALprcokGE8=":{"average":79.55,"games":2},"KbxU8DuhlgI38Qr3BiFXjFw8S63kceH4XobKzdFtJoQ=":{"average":95.35,"games":1},"eSwug206YBYgMv8L79ZHDRSZFsVkplce3662b04Dk7Q=":{"average":90.07,"games":1},"quAux2HIkYCV/+HGsMT6VGep1drILkkUNExyxDz4hZc=":{"average":95.53,"games":1},"UMBo309x93drsSndLlc6gzXqqgNE4/TI95KT1MH1xgY=":{"average":76.49,"games":2},"B8E45xeUB7GBpvTKRBO9M4m8WuFSUB0msSO58r4jZr4=":{"average":93.56,"games":2},"07lP9kVZvreKRny6EGo8Yq6pBjuaPozG957C2sG6teY=":{"average":93.94,"games":2},"T2SEfVAoX76P2UaSnszZXnJ1t6dQhyBvqiPvSSIktbk=":{"average":71.47,"games":1}});
const COMPACT_COMPARISON_PARAM = "C";
const COMPACT_PLAYER_PARAM = "p";
const RATE_SORT_MIN_GAMES = 10;
const HIDDEN_LEADERBOARDS = new Set(["NTW >= 6 Players", "1v1 High Oil"]);
const SORT_DEFAULTS = {
  ranks: { key: "rank", direction: "asc" },
  "player-games": { key: "date", direction: "desc" },
  matches: { key: "date", direction: "desc" }
};
const SORT_ALLOWED_KEYS = {
  ranks: new Set(["rank", "player", "elo", "matches", "wins", "losses", "draws", "crashes", "winRate", "lossRate", "drawRate", "crashRate"]),
  "player-games": new Set(["date", "map", "result", "duration", "replay"]),
  matches: new Set(["date", "map", "players", "duration", "replay"])
};
const SORT_DEFAULT_DIRECTIONS = {
  ranks: {
    rank: "asc",
    player: "asc",
    elo: "desc",
    matches: "desc",
    wins: "desc",
    losses: "desc",
    draws: "desc",
    crashes: "desc",
    winRate: "desc",
    lossRate: "desc",
    drawRate: "desc",
    crashRate: "desc"
  },
  "player-games": {
    date: "desc",
    map: "asc",
    result: "desc",
    duration: "desc",
    replay: "desc"
  },
  matches: {
    date: "desc",
    map: "asc",
    players: "desc",
    duration: "desc",
    replay: "desc"
  }
};
const PLAYER_GAME_RESULT_ORDER = {
  Lost: 0,
  Played: 1,
  Crash: 2,
  Draw: 3,
  Won: 4
};

const statusElement = document.getElementById("resultsStatus");
const summaryElement = document.getElementById("statsSummary");
const buttonsElement = document.getElementById("statsLeaderboardButtons");
const ranksElement = document.getElementById("statsRanks");
const rankActionsElement = document.getElementById("statsRanksActions");
const playerGamesTitleElement = document.getElementById("statsPlayerGamesTitle");
const playerGamesMetaElement = document.getElementById("statsPlayerGamesMeta");
const playerProfileElement = document.getElementById("statsPlayerProfile");
const playerComparisonElement = document.getElementById("statsPlayerComparison");
const playerGamesElement = document.getElementById("statsPlayerGames");
const playerGamesActionsElement = document.getElementById("statsPlayerGamesActions");
const playerSearchElement = document.getElementById("statsPlayerSearch");
const matchesSearchElement = document.getElementById("statsMatchesSearch");
const matchesElement = document.getElementById("statsMatches");
const matchesActionsElement = document.getElementById("statsMatchesActions");
const matchFiltersElement = document.getElementById("statsMatchFilters");
const matchFilterCountElement = document.getElementById("statsMatchFilterCount");
const matchesDateFromElement = document.getElementById("statsMatchesDateFrom");
const matchesDateToElement = document.getElementById("statsMatchesDateTo");
const matchesMapElement = document.getElementById("statsMatchesMap");
const matchesMinDurationElement = document.getElementById("statsMatchesMinDuration");
const matchesMaxDurationElement = document.getElementById("statsMatchesMaxDuration");
const matchesMinPlayersElement = document.getElementById("statsMatchesMinPlayers");
const matchesMaxPlayersElement = document.getElementById("statsMatchesMaxPlayers");
const matchesMinPowerGapElement = document.getElementById("statsMatchesMinPowerGap");
const matchesUpsetsOnlyElement = document.getElementById("statsMatchesUpsetsOnly");
const sortHeaderElements = [...document.querySelectorAll("[data-sort-table][data-sort-key]")];

let selectedLeaderboard = "Global";
let resultsData = { format: 0, results: [] };
let leaderboardData = null;
let leaderboardDataSignature = "";
let liveFeedState = "idle";
let playerPublicKeys = {};
let upstreamManifest = null;
let runtime = createRuntime();
let currentRuntimeKey = "";
let currentPlayerKeysKey = "";
let currentSnapshotKey = "";
let eventSource = null;
let refreshTimer = null;
let visibilityListenerAttached = false;
let visiblePlayerCount = INITIAL_PLAYER_LIMIT;
let visibleMatchCount = INITIAL_MATCH_LIMIT;
let playerSearchQuery = "";
let matchesSearchQuery = "";
let matchesDateFrom = "";
let matchesDateTo = "";
let matchesMap = "";
let matchesMinDuration = "";
let matchesMaxDuration = "";
let matchesMinPlayers = "";
let matchesMaxPlayers = "";
let matchesMinPowerGap = "";
let matchesUpsetsOnly = false;
let comparePlayerAKey = null;
let comparePlayerBKey = null;
let comparisonShareKeyByAccountKey = new Map();
let matchMapOptionsSignature = "";
let leaderboardGameCounts = new Map();
let globalRankMap = new Map();
let statusRefreshTimer = null;
let lastStatsUpdateAt = 0;
let expandedAccounts = new Set();
let activeExpandedAccountKey = null;
let activeExpandedPlayerGameKey = null;
let showingAllPlayerGames = false;
let rankSortState = cloneSortState(SORT_DEFAULTS.ranks);
let playerGamesSortState = cloneSortState(SORT_DEFAULTS["player-games"]);
let matchesSortState = cloneSortState(SORT_DEFAULTS.matches);
const allTeamsLostDrawCache = new WeakMap();
const accountDisplayStatsCache = new WeakMap();

function createRuntime() {
  return {
    gather: null,
    calculate: null,
    leaderboards: ["Global"],
    filterGame() {
      return true;
    }
  };
}

function cloneSortState(sortState) {
  return {
    key: sortState.key,
    direction: sortState.direction
  };
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function getAssetHash(name) {
  return upstreamManifest?.files?.[name]?.sha256?.slice(0, 16) || "local";
}

function getSortState(table) {
  switch (table) {
    case "ranks":
      return rankSortState;
    case "player-games":
      return playerGamesSortState;
    case "matches":
      return matchesSortState;
    default:
      return cloneSortState(SORT_DEFAULTS.ranks);
  }
}

function setSortState(table, sortState) {
  switch (table) {
    case "ranks":
      rankSortState = sortState;
      break;
    case "player-games":
      playerGamesSortState = sortState;
      break;
    case "matches":
      matchesSortState = sortState;
      break;
    default:
      break;
  }
}

function getDefaultSortDirection(table, key) {
  return SORT_DEFAULT_DIRECTIONS[table]?.[key] || "asc";
}

function parseSortState(value, table) {
  const fallback = SORT_DEFAULTS[table];
  if (!value || !fallback) {
    return cloneSortState(fallback || SORT_DEFAULTS.ranks);
  }

  const [key, direction] = String(value).split(":");
  if (table === "ranks" && key === "record") {
    return {
      key: "wins",
      direction: direction === "asc" ? "asc" : "desc"
    };
  }
  if (!SORT_ALLOWED_KEYS[table]?.has(key)) {
    return cloneSortState(fallback);
  }

  return {
    key,
    direction: direction === "desc" ? "desc" : "asc"
  };
}

function encodeSortState(sortState) {
  return `${sortState.key}:${sortState.direction}`;
}

function isDefaultSortState(table, sortState) {
  const fallback = SORT_DEFAULTS[table];
  return Boolean(fallback)
    && fallback.key === sortState.key
    && fallback.direction === sortState.direction;
}

function compareNumberValues(left, right) {
  const normalizedLeft = Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY;
  const normalizedRight = Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY;
  return normalizedLeft - normalizedRight;
}

function compareTextValues(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
    numeric: true
  });
}

function applySortDirection(result, direction) {
  return direction === "desc" ? -result : result;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function updateSortIndicators() {
  sortHeaderElements.forEach((sortTarget) => {
    const table = sortTarget.dataset.sortTable;
    const key = sortTarget.dataset.sortKey;
    const sortState = getSortState(table);
    const isActive = sortState.key === key;
    const button = sortTarget.matches(".stats-sort-button")
      ? sortTarget
      : sortTarget.querySelector(".stats-sort-button");
    const header = sortTarget.matches("th") ? sortTarget : sortTarget.closest("th");

    if (sortTarget.matches("th")) {
      sortTarget.setAttribute(
        "aria-sort",
        isActive
          ? (sortState.direction === "asc" ? "ascending" : "descending")
          : "none"
      );
    } else if (button) {
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    if (!button) {
      return;
    }

    button.classList.toggle("is-active", isActive);
    button.dataset.direction = isActive ? sortState.direction : "";
    if (!sortTarget.matches("th") && header && !header.hasAttribute("data-sort-key")) {
      if (isActive) {
        header.setAttribute("aria-sort", sortState.direction === "asc" ? "ascending" : "descending");
      } else if (![...header.querySelectorAll(".stats-sort-button[data-direction]")].some((item) => item.dataset.direction)) {
        header.setAttribute("aria-sort", "none");
      }
    }
  });
}

function setupSortHeaders() {
  sortHeaderElements.forEach((sortTarget) => {
    const button = sortTarget.matches(".stats-sort-button")
      ? sortTarget
      : sortTarget.querySelector(".stats-sort-button");
    if (!button || button.dataset.sortBound === "true") {
      return;
    }

    button.dataset.sortBound = "true";
    button.addEventListener("click", () => {
      const table = sortTarget.dataset.sortTable;
      const key = sortTarget.dataset.sortKey;
      if (!table || !key) {
        return;
      }

      const currentSort = getSortState(table);
      const defaultDirection = getDefaultSortDirection(table, key);
      const defaultSort = cloneSortState(SORT_DEFAULTS[table] || SORT_DEFAULTS.ranks);
      const nextSort = currentSort.key === key
        ? (
            currentSort.direction === defaultDirection
              ? {
                  key,
                  direction: currentSort.direction === "asc" ? "desc" : "asc"
                }
              : defaultSort
          )
        : {
            key,
            direction: defaultDirection
          };

      setSortState(table, nextSort);
      updateSortIndicators();
      render();
    });
  });

  updateSortIndicators();
}

function buildVersionedUrl(baseUrl, version, bust = false) {
  const url = new URL(baseUrl);
  if (version) {
    url.searchParams.set("v", version);
  }
  if (bust) {
    url.searchParams.set("t", Date.now().toString());
  }
  return url;
}

async function readJson(baseUrl, version, bust = false) {
  const response = await fetch(buildVersionedUrl(baseUrl, version, bust), {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Unable to load ${baseUrl.pathname} (${response.status})`);
  }
  return JSON.parse(stripBom(await response.text()));
}

async function readManifest() {
  try {
    return await readJson(MANIFEST_URL, "manifest", true);
  } catch (error) {
    console.warn("Unable to refresh the upstream manifest.", error);
    return null;
  }
}

async function ensureRuntime(force = false) {
  const runtimeKey = `${getAssetHash("calculate.js")}:${getAssetHash("leaderboards.js")}`;
  if (!force && runtimeKey === currentRuntimeKey) {
    return false;
  }

  const [calculateModule, leaderboardsModule] = await Promise.all([
    import(buildVersionedUrl(CALCULATE_URL, getAssetHash("calculate.js")).href),
    import(buildVersionedUrl(LEADERBOARDS_URL, getAssetHash("leaderboards.js")).href)
  ]);

  runtime = {
    gather: calculateModule.gather,
    calculate: calculateModule.calculate,
    leaderboards: leaderboardsModule.leaderboards,
    filterGame: leaderboardsModule.filterGame
  };

  currentRuntimeKey = runtimeKey;
  ensureSelectedLeaderboard();
  renderButtons();
  return true;
}

async function ensurePlayerKeys(force = false) {
  const playerKeysKey = getAssetHash("player-public-keys.json");
  if (!force && playerKeysKey === currentPlayerKeysKey) {
    return false;
  }

  playerPublicKeys = await readJson(PLAYER_KEYS_URL, playerKeysKey);
  currentPlayerKeysKey = playerKeysKey;
  return true;
}

async function ensureSnapshot(force = false) {
  const snapshotKey = getAssetHash("results-snapshot.json");
  if (!force && snapshotKey === currentSnapshotKey) {
    return false;
  }

  resultsData = await readJson(SNAPSHOT_URL, snapshotKey);
  currentSnapshotKey = snapshotKey;
  return true;
}

async function ensureLeaderboardData(force = false) {
  const payload = await readJson(
    WZSTATS_LEADERBOARDS_URL,
    force ? Date.now().toString() : "leaderboards",
    force
  );
  const signature = `${payload.generatedAt || ""}:${payload.coverage?.attributedMatches || 0}`;
  if (!force && signature === leaderboardDataSignature) {
    return false;
  }
  if (!payload.leaderboards || !Array.isArray(payload.games)) {
    throw new Error("Published leaderboard data is incomplete.");
  }
  leaderboardData = payload;
  leaderboardDataSignature = signature;
  runtime.leaderboards = Object.keys(payload.leaderboards);
  ensureSelectedLeaderboard();
  renderButtons();
  return true;
}

function hydratePublishedBoard(name) {
  const board = leaderboardData?.leaderboards?.[name];
  if (!board) {
    return { accounts: new Map(), games: [] };
  }

  const accounts = new Map((board.players || []).map((player) => [String(player.id), {
    mainPublicKey: player.mainPublicKey || null,
    publicKeys: new Set(player.publicKeys || []),
    name: player.name || "Unknown",
    names: new Map(Object.entries(player.names || { [player.name || "Unknown"]: 1 })),
    bot: Boolean(player.bot),
    games: [],
    elo: Number(player.elo || 1500),
    winCount: Number(player.wins || 0),
    loseCount: Number(player.losses || 0),
    drawCount: Number(player.draws || 0),
    totalKills: Number(player.totalKills || 0),
    favoriteUnits: Array.isArray(player.favoriteUnits) ? player.favoriteUnits : [],
    discounted: Boolean(player.discounted)
  }]));
  const gameIds = new Set(board.gameIds || []);
  const ratingEvents = board.ratingEvents || {};
  const games = (leaderboardData.games || [])
    .filter((game) => gameIds.has(game.id))
    .map((publishedGame) => {
      const slots = (publishedGame.slots || []).map((slot) => {
        let account = accounts.get(String(slot.id));
        if (!account) {
          account = {
            mainPublicKey: null, publicKeys: new Set(), name: slot.name || "Unknown",
            names: new Map([[slot.name || "Unknown", 1]]), bot: true, games: [],
            elo: 1500, winCount: 0, loseCount: 0, drawCount: 0, totalKills: 0, discounted: true
          };
          accounts.set(String(slot.id), account);
        }
        const rating = ratingEvents[publishedGame.id]?.[String(slot.id)];
        return {
          position: Number(slot.position || 0), team: Number(slot.team || 0),
          userType: slot.userType || null, account,
          elo: rating && Number.isFinite(Number(rating.elo)) ? Number(rating.elo) : null,
          eloDelta: rating && Number.isFinite(Number(rating.eloDelta)) ? Number(rating.eloDelta) : null
        };
      });
      const teamsByNumber = new Map();
      slots.forEach((slot) => {
        if (!teamsByNumber.has(slot.team)) {
          teamsByNumber.set(slot.team, { userType: null, slots: [], players: [] });
        }
        const team = teamsByNumber.get(slot.team);
        team.slots.push(slot);
        if (["winner", "loser", "contender"].includes(slot.userType)) team.players.push(slot);
      });
      const teams = [...teamsByNumber.values()];
      teams.forEach((team) => {
        const types = [...new Set(team.players.map((slot) => slot.userType))];
        team.userType = types.length === 1 ? types[0] : null;
      });
      const game = {
        ...publishedGame,
        endDate: Number(publishedGame.endDate || 0),
        duration: Number(publishedGame.duration || 0),
        alliancesType: Number(publishedGame.alliancesType || 0),
        slots,
        players: slots.filter((slot) => ["winner", "loser", "contender"].includes(slot.userType)),
        teams
      };
      slots.forEach((slot) => slot.account.games.push(game));
      return game;
    });
  return { accounts, games };
}

function getFavoriteUnitNameCandidates() {
  const candidates = new Map();
  Object.values(leaderboardData?.leaderboards || {}).forEach((board) => {
    (board.players || []).forEach((player) => {
      (player.favoriteUnits || []).forEach((unit) => {
        if (!unit.signature || !unit.name) return;
        if (!candidates.has(unit.signature)) candidates.set(unit.signature, []);
        const names = candidates.get(unit.signature);
        if (!names.includes(unit.name)) names.push(unit.name);
      });
    });
  });
  return candidates;
}

function getGlobalFavoriteUnits(account) {
  const accountKeys = account?.publicKeys instanceof Set
    ? account.publicKeys
    : new Set(account?.publicKeys || []);
  const unitsBySignature = new Map();

  Object.values(leaderboardData?.leaderboards || {}).forEach((board) => {
    (board.players || []).forEach((player) => {
      const playerKeys = Array.isArray(player.publicKeys) ? player.publicKeys : [];
      if (!playerKeys.some((key) => accountKeys.has(key))) return;

      (player.favoriteUnits || []).forEach((unit) => {
        if (!unit?.signature) return;
        const existing = unitsBySignature.get(unit.signature);
        if (!existing || Number(unit.count || 0) > Number(existing.count || 0)) {
          unitsBySignature.set(unit.signature, unit);
        }
      });
    });
  });

  return [...unitsBySignature.values()]
    .sort((left, right) => Number(right.count || 0) - Number(left.count || 0));
}

function ensureSelectedLeaderboard() {
  const availableLeaderboards = runtime.leaderboards?.length ? runtime.leaderboards : ["Global"];
  const previousLeaderboard = selectedLeaderboard;
  if (!availableLeaderboards.includes(selectedLeaderboard)) {
    selectedLeaderboard = availableLeaderboards.includes("Global")
      ? "Global"
      : availableLeaderboards[0];
  }
  if (selectedLeaderboard !== previousLeaderboard) {
    visiblePlayerCount = INITIAL_PLAYER_LIMIT;
    visibleMatchCount = INITIAL_MATCH_LIMIT;
  }
}

function accountSortKey(account) {
  return !account.discounted ? account.elo : -1000000000 + account.games.length;
}

function sortAccounts(accounts) {
  return [...accounts].sort((left, right) => accountSortKey(right) - accountSortKey(left));
}

function filterVisibleAccounts(accountList) {
  return accountList.filter((account) => !account.discounted || account.games.length >= 2);
}

function getNextPlayerLimit(currentCount, totalCount) {
  if (currentCount < PLAYER_LIMIT_STEP) {
    return Math.min(PLAYER_LIMIT_STEP, totalCount);
  }

  return Math.min(currentCount + PLAYER_LIMIT_STEP, totalCount);
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function applyStateFromUrl() {
  const url = new URL(window.location.href);
  const compactComparisonKeys = parseCompactComparisonValue(
    url.searchParams.get(COMPACT_COMPARISON_PARAM)
  );
  selectedLeaderboard = url.searchParams.get("leaderboard") || "Global";
  visibleMatchCount = INITIAL_MATCH_LIMIT;
  visiblePlayerCount = Math.max(
    INITIAL_PLAYER_LIMIT,
    parsePositiveInteger(url.searchParams.get("players"), INITIAL_PLAYER_LIMIT)
  );
  playerSearchQuery = url.searchParams.get("playerSearch") || "";
  matchesSearchQuery = url.searchParams.get("matchesSearch") || "";
  matchesDateFrom = url.searchParams.get("matchesFrom") || "";
  matchesDateTo = url.searchParams.get("matchesTo") || "";
  matchesMap = url.searchParams.get("matchesMap") || "";
  matchesMinDuration = url.searchParams.get("matchesMinMinutes") || "";
  matchesMaxDuration = url.searchParams.get("matchesMaxMinutes") || "";
  matchesMinPlayers = url.searchParams.get("matchesMinPlayers") || "";
  matchesMaxPlayers = url.searchParams.get("matchesMaxPlayers") || "";
  matchesMinPowerGap = url.searchParams.get("matchesMinPowerGap") || "";
  matchesUpsetsOnly = url.searchParams.get("matchesUpsets") === "1";
  comparePlayerAKey = compactComparisonKeys?.[0]
    || url.searchParams.get("a")
    || url.searchParams.get("compareA")
    || null;
  comparePlayerBKey = compactComparisonKeys?.[1]
    || url.searchParams.get("b")
    || url.searchParams.get("compareB")
    || null;
  activeExpandedAccountKey = parseCompactPlayerValue(url.searchParams.get(COMPACT_PLAYER_PARAM))
    || url.searchParams.get("player")
    || null;
  activeExpandedPlayerGameKey = url.searchParams.get("game") || null;
  showingAllPlayerGames = url.searchParams.get("playerGames") === "all";
  rankSortState = parseSortState(url.searchParams.get("ranksSort"), "ranks");
  playerGamesSortState = parseSortState(url.searchParams.get("playerGamesSort"), "player-games");
  matchesSortState = parseSortState(url.searchParams.get("matchesSort"), "matches");
  expandedAccounts = activeExpandedAccountKey ? new Set([activeExpandedAccountKey]) : new Set();

  if (playerSearchElement) {
    playerSearchElement.value = playerSearchQuery;
  }

  if (matchesSearchElement) {
    matchesSearchElement.value = matchesSearchQuery;
  }

  [
    [matchesDateFromElement, matchesDateFrom],
    [matchesDateToElement, matchesDateTo],
    [matchesMapElement, matchesMap],
    [matchesMinDurationElement, matchesMinDuration],
    [matchesMaxDurationElement, matchesMaxDuration],
    [matchesMinPlayersElement, matchesMinPlayers],
    [matchesMaxPlayersElement, matchesMaxPlayers],
    [matchesMinPowerGapElement, matchesMinPowerGap]
  ].forEach(([element, value]) => {
    if (element) {
      element.value = value;
    }
  });

  if (matchesUpsetsOnlyElement) {
    matchesUpsetsOnlyElement.checked = matchesUpsetsOnly;
  }

  if (matchFiltersElement && getActiveMatchFilterCount()) {
    matchFiltersElement.open = true;
  }

  updateSortIndicators();
}

function buildStateParams() {
  const params = new URLSearchParams();

  if (selectedLeaderboard !== "Global") {
    params.set("leaderboard", selectedLeaderboard);
  }

  if (ranksElement && visiblePlayerCount > INITIAL_PLAYER_LIMIT) {
    params.set("players", String(visiblePlayerCount));
  }

  if (playerSearchElement && playerSearchQuery.trim()) {
    params.set("playerSearch", playerSearchQuery.trim());
  }

  if (matchesSearchElement && matchesSearchQuery.trim()) {
    params.set("matchesSearch", matchesSearchQuery.trim());
  }

  [
    ["matchesFrom", matchesDateFrom],
    ["matchesTo", matchesDateTo],
    ["matchesMap", matchesMap],
    ["matchesMinMinutes", matchesMinDuration],
    ["matchesMaxMinutes", matchesMaxDuration],
    ["matchesMinPlayers", matchesMinPlayers],
    ["matchesMaxPlayers", matchesMaxPlayers],
    ["matchesMinPowerGap", matchesMinPowerGap]
  ].forEach(([key, value]) => {
    if (matchesElement && String(value || "").trim()) {
      params.set(key, String(value).trim());
    }
  });

  if (matchesElement && matchesUpsetsOnly) {
    params.set("matchesUpsets", "1");
  }

  if (ranksElement && activeExpandedAccountKey) {
    const compactPlayerKey = /^p[a-z0-9]+$/i.test(activeExpandedAccountKey)
      ? activeExpandedAccountKey
      : getCompactAccountKey(activeExpandedAccountKey);
    params.set(COMPACT_PLAYER_PARAM, compactPlayerKey.replace(/^p/, ""));
  }

  if (playerComparisonElement && comparePlayerAKey && comparePlayerBKey) {
    setCompactComparisonParams(params, comparePlayerAKey, comparePlayerBKey);
  } else {
    if (playerComparisonElement && comparePlayerAKey) {
      params.set("a", comparisonShareKeyByAccountKey.get(comparePlayerAKey) || comparePlayerAKey);
    }

    if (playerComparisonElement && comparePlayerBKey) {
      params.set("b", comparisonShareKeyByAccountKey.get(comparePlayerBKey) || comparePlayerBKey);
    }
  }

  if (playerGamesElement && activeExpandedPlayerGameKey) {
    params.set("game", activeExpandedPlayerGameKey);
  }

  if (playerGamesElement && showingAllPlayerGames) {
    params.set("playerGames", "all");
  }

  if (ranksElement && !isDefaultSortState("ranks", rankSortState)) {
    params.set("ranksSort", encodeSortState(rankSortState));
  }

  if (playerGamesElement && !isDefaultSortState("player-games", playerGamesSortState)) {
    params.set("playerGamesSort", encodeSortState(playerGamesSortState));
  }

  if (matchesElement && !isDefaultSortState("matches", matchesSortState)) {
    params.set("matchesSort", encodeSortState(matchesSortState));
  }

  return params;
}

function syncStateToUrl() {
  const url = new URL(window.location.href);
  const params = buildStateParams();
  url.search = params.toString();
  window.history.replaceState({ search: url.search }, "", url);
  window.bohaEmbeddedPage?.postState(url.search);
}

function resetPlayerGamesView() {
  showingAllPlayerGames = false;
  activeExpandedPlayerGameKey = null;
}

function getMirrorSyncTime() {
  return upstreamManifest?.syncedAt ? new Date(upstreamManifest.syncedAt).getTime() : 0;
}

function isMirrorStale() {
  const mirrorSyncTime = getMirrorSyncTime();
  return Boolean(mirrorSyncTime) && Date.now() - mirrorSyncTime > STALE_MIRROR_MS;
}

function getLatestEndDate(results) {
  return results.reduce((max, result) => Math.max(max, Number(result.endDate || 0)), 0);
}

function normalizeReplayUrl(url) {
  return String(url || "").replace(/^http:\/\//i, "https://");
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRelativeTime(value) {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) {
    return "Update unavailable";
  }

  const diffMs = Math.max(0, Date.now() - updatedAt);
  if (diffMs < 60_000) {
    return "Updated just now";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `Updated ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

function formatMatchDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function formatMatchTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAlliance(game) {
  if (game.players.length === 2) {
    return "1v1";
  }

  if (game.teams.every((team) => team.players.length === 1)) {
    return "FFA";
  }

  switch (game.alliancesType) {
    case 0:
      return "FFA";
    case 1:
      return "Allow";
    case 2:
      return "Shared";
    case 3:
      return "Nonshared";
    default:
      return "?";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTeamToneClass(userType) {
  switch (userType) {
    case "winner":
      return "stats-team-winner";
    case "loser":
      return "stats-team-loser";
    case "contender":
      return "stats-team-contender";
    default:
      return "stats-team-neutral";
  }
}

function matchesPlayerSearch(account, searchQuery) {
  if (!searchQuery) {
    return true;
  }

  const playerName = String(account.name || "").toLowerCase();
  if (playerName.includes(searchQuery)) {
    return true;
  }

  if ([...account.names.keys()].some((name) => String(name || "").toLowerCase().includes(searchQuery))) {
    return true;
  }

  return [...account.publicKeys].some((publicKey) => String(publicKey || "").toLowerCase().includes(searchQuery));
}

function getSortedAccountNames(account) {
  return [...account.names.entries()]
    .filter(([name, count]) => name && count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function matchesRecentGameSearch(game, searchQuery) {
  if (!searchQuery) {
    return true;
  }

  if (String(game.mapName || "").toLowerCase().includes(searchQuery)) {
    return true;
  }

  if (String(game.mods || "").toLowerCase().includes(searchQuery)) {
    return true;
  }

  if (String(game.replayUrl || "").toLowerCase().includes(searchQuery)) {
    return true;
  }

  return game.players.some((slot) => {
    const account = slot.account;
    if (!account) {
      return false;
    }

    if (String(account.name || "").toLowerCase().includes(searchQuery)) {
      return true;
    }

    if ([...account.names.keys()].some((name) => String(name || "").toLowerCase().includes(searchQuery))) {
      return true;
    }

    return [...account.publicKeys].some((publicKey) => String(publicKey || "").toLowerCase().includes(searchQuery));
  });
}

function getAccountExpandKey(account) {
  const displayStats = getAccountDisplayStats(account);
  if (account.mainPublicKey) {
    return `main:${account.mainPublicKey}`;
  }

  const publicKeys = [...account.publicKeys].sort();
  if (publicKeys.length) {
    return `keys:${publicKeys.join("|")}`;
  }

  return `name:${account.name || "unknown"}:${account.games.length}:${displayStats.wins}:${displayStats.losses}:${displayStats.draws}:${displayStats.crashes}`;
}

function getCompactAccountKey(accountKey) {
  let firstHash = 2166136261;
  let secondHash = 2246822519;

  for (let index = 0; index < accountKey.length; index += 1) {
    const characterCode = accountKey.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ characterCode, 16777619);
    secondHash = Math.imul(secondHash ^ characterCode, 3266489917);
  }

  return `p${(firstHash >>> 0).toString(36)}${(secondHash >>> 0).toString(36)}`;
}

function parseCompactPlayerValue(value) {
  const token = String(value || "").trim();
  if (!/^[a-z0-9]+$/i.test(token)) {
    return null;
  }

  return `p${token}`;
}

function resolveActivePlayerShareKey(accountList) {
  if (!/^p[a-z0-9]+$/i.test(activeExpandedAccountKey || "")) {
    return;
  }

  const matches = accountList.filter((account) => (
    getCompactAccountKey(getAccountExpandKey(account)) === activeExpandedAccountKey
  ));
  if (matches.length !== 1) {
    return;
  }

  activeExpandedAccountKey = getAccountExpandKey(matches[0]);
  expandedAccounts = new Set([activeExpandedAccountKey]);
}

function parseCompactComparisonValue(value) {
  const tokens = String(value || "").split(".");
  if (tokens.length !== 2 || tokens.some((token) => !/^[a-z0-9]+$/i.test(token))) {
    return null;
  }

  return tokens.map((token) => `p${token}`);
}

function setCompactComparisonParams(params, accountAKey, accountBKey) {
  const getToken = (accountKey) => (
    comparisonShareKeyByAccountKey.get(accountKey) || getCompactAccountKey(accountKey)
  ).replace(/^p/, "");
  params.set(COMPACT_COMPARISON_PARAM, `${getToken(accountAKey)}.${getToken(accountBKey)}`);
}

function buildGlobalRankMap(accountList) {
  return new Map(
    filterVisibleAccounts(accountList)
      .map((account, index) => [getAccountExpandKey(account), index + 1])
  );
}

function getGlobalRankLabel(account) {
  if (!account) {
    return "NR";
  }

  return globalRankMap.get(getAccountExpandKey(account)) || "NR";
}

function getNumericGlobalRank(account) {
  if (!account) {
    return null;
  }

  const rank = globalRankMap.get(getAccountExpandKey(account));
  return Number.isFinite(rank) ? rank : null;
}

function getPlayerPowerLabel(account) {
  const totalRankedPlayers = globalRankMap.size;
  const rank = getNumericGlobalRank(account);
  if (!totalRankedPlayers || !rank) {
    return "50%";
  }

  return `${Math.round(((totalRankedPlayers - rank + 1) / totalRankedPlayers) * 100)}%`;
}

function getTeamStrengthPercent(team) {
  const totalRankedPlayers = globalRankMap.size;
  if (!totalRankedPlayers || !team.players.length) {
    return null;
  }

  const strengthScore = team.players.reduce((total, player) => {
    const rank = getNumericGlobalRank(player.account);
    if (!rank) {
      return total + 0.5;
    }

    return total + ((totalRankedPlayers - rank + 1) / totalRankedPlayers);
  }, 0);

  return Math.round((strengthScore / team.players.length) * 100);
}

function getTeamStrengthToneClass(strengthPercent, allStrengths) {
  if (!Number.isFinite(strengthPercent)) {
    return "stats-team-strength-neutral";
  }

  const validStrengths = allStrengths.filter((value) => Number.isFinite(value));
  if (!validStrengths.length) {
    return "stats-team-strength-neutral";
  }

  const strongest = Math.max(...validStrengths);
  const weakest = Math.min(...validStrengths);
  if (strongest === weakest) {
    return "stats-team-strength-neutral";
  }

  if (strengthPercent === strongest) {
    return "stats-team-strength-stronger";
  }

  if (strengthPercent === weakest) {
    return "stats-team-strength-lower";
  }

  return "stats-team-strength-middle";
}

function hasBalancedTeams(game) {
  const teams = Array.isArray(game?.teams) ? game.teams : [];
  if (!teams.length) {
    return false;
  }

  let smallestTeam = null;
  let biggestTeam = null;
  for (const team of teams) {
    if (!smallestTeam || team.players.length < smallestTeam.players.length) {
      smallestTeam = team;
    }
    if (!biggestTeam || team.players.length > biggestTeam.players.length) {
      biggestTeam = team;
    }
  }

  return Boolean(smallestTeam && biggestTeam)
    && smallestTeam.players.length === biggestTeam.players.length;
}

function shouldTreatAllTeamsLostAsDraw(game) {
  if (!game || typeof game !== "object") {
    return false;
  }

  if (allTeamsLostDrawCache.has(game)) {
    return allTeamsLostDrawCache.get(game);
  }

  const teams = Array.isArray(game.teams)
    ? game.teams.filter((team) => Array.isArray(team.players) && team.players.length)
    : [];
  const shouldTreatAsDraw = teams.length > 1
    && !game.cheated
    && Number(game.duration || 0) >= 3 * 60 * 1000
    && hasBalancedTeams(game)
    && teams.every((team) => team.userType === "loser");

  allTeamsLostDrawCache.set(game, shouldTreatAsDraw);
  return shouldTreatAsDraw;
}

function getNormalizedTeamUserType(game, team) {
  if (shouldTreatAllTeamsLostAsDraw(game) && Array.isArray(team?.players) && team.players.length) {
    return "neutral";
  }

  return team?.userType || null;
}

function getAccountDisplayStats(account) {
  if (!account || typeof account !== "object") {
    return { wins: 0, losses: 0, draws: 0, crashes: 0 };
  }

  if (accountDisplayStatsCache.has(account)) {
    return accountDisplayStatsCache.get(account);
  }

  const crashCount = (account.games || []).reduce(
    (count, game) => count + (shouldTreatAllTeamsLostAsDraw(game) ? 1 : 0),
    0
  );
  const displayStats = {
    wins: account.winCount || 0,
    losses: account.loseCount || 0,
    draws: account.drawCount || 0,
    crashes: crashCount
  };

  accountDisplayStatsCache.set(account, displayStats);
  return displayStats;
}

function getPlayerGameOutcome(game, account) {
  const slot = game.players.find((playerSlot) => playerSlot.account === account)
    || (game.slots || []).find((playerSlot) => playerSlot.account === account);
  if (shouldTreatAllTeamsLostAsDraw(game) && slot?.userType === "loser") {
    return { label: "Crash", className: "is-crash" };
  }

  const userType = slot?.userType;

  switch (userType) {
    case "winner":
      return { label: "Won", className: "is-win" };
    case "loser":
      return { label: "Lost", className: "is-loss" };
    case "contender":
      return { label: "Draw", className: "is-draw" };
    default:
      return { label: "Played", className: "is-neutral" };
  }
}

function getPlayerGameKey(game) {
  return [
    Number(game.endDate || 0),
    String(game.mapName || ""),
    Number(game.duration || 0),
    String(game.replayUrl || "")
  ].join("|");
}

function getReplaySortValue(replayUrl) {
  if (!replayUrl) {
    return "";
  }

  return normalizeReplayUrl(replayUrl);
}

function getPlayerCount(game) {
  return Array.isArray(game.players) ? game.players.length : 0;
}

function getRankRecordScore(account) {
  const displayStats = getAccountDisplayStats(account);
  const totalGames = getAccountRankedGameCount(account) || 1;
  return ((displayStats.wins * 3) + displayStats.draws) / totalGames;
}

function getAccountRankedGameCount(account) {
  const displayStats = getAccountDisplayStats(account);
  return displayStats.wins + displayStats.losses + displayStats.draws;
}

function getAccountDisplayGameCount(account) {
  const displayStats = getAccountDisplayStats(account);
  return displayStats.wins + displayStats.losses + displayStats.draws + displayStats.crashes;
}

function getRankResultRate(account, type) {
  const displayStats = getAccountDisplayStats(account);
  const totalGames = getAccountDisplayGameCount(account);
  if (totalGames <= 0) {
    return 0;
  }

  switch (type) {
    case "winRate":
      return displayStats.wins / totalGames;
    case "lossRate":
      return displayStats.losses / totalGames;
    case "drawRate":
      return displayStats.draws / totalGames;
    case "crashRate":
      return displayStats.crashes / totalGames;
    default:
      return 0;
  }
}

function formatRecordPercentage(value, totalGames) {
  if (!Number.isFinite(totalGames) || totalGames <= 0) {
    return "0%";
  }

  return `${Math.round((value / totalGames) * 100)}%`;
}

function compareRankRateRows(left, right, type, direction) {
  const leftGames = getAccountDisplayGameCount(left.account);
  const rightGames = getAccountDisplayGameCount(right.account);
  const leftEligible = leftGames >= RATE_SORT_MIN_GAMES ? 1 : 0;
  const rightEligible = rightGames >= RATE_SORT_MIN_GAMES ? 1 : 0;
  const leftStats = getAccountDisplayStats(left.account);
  const rightStats = getAccountDisplayStats(right.account);

  return compareNumberValues(rightEligible, leftEligible)
    || applySortDirection(
      compareNumberValues(
        getRankResultRate(left.account, type),
        getRankResultRate(right.account, type)
      ),
      direction
    )
    || compareNumberValues(leftGames, rightGames)
    || compareNumberValues(leftStats.wins, rightStats.wins)
    || compareNumberValues(rightStats.losses, leftStats.losses)
    || compareNumberValues(leftStats.draws, rightStats.draws)
    || compareNumberValues(rightStats.crashes, leftStats.crashes)
    || compareNumberValues(left.rank, right.rank);
}

function compareRankRows(left, right) {
  const leftStats = getAccountDisplayStats(left.account);
  const rightStats = getAccountDisplayStats(right.account);
  let result = 0;

  switch (rankSortState.key) {
    case "player":
      result = compareTextValues(left.account.name, right.account.name)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "elo":
      result = compareNumberValues(
        left.account.discounted ? Number.NEGATIVE_INFINITY : left.account.elo,
        right.account.discounted ? Number.NEGATIVE_INFINITY : right.account.elo
      ) || compareNumberValues(left.rank, right.rank);
      break;
    case "matches":
      result = compareNumberValues(left.account.games.length, right.account.games.length)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "wins":
      result = compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(getRankRecordScore(left.account), getRankRecordScore(right.account))
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "losses":
      result = compareNumberValues(leftStats.losses, rightStats.losses)
        || compareNumberValues(rightStats.wins, leftStats.wins)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "draws":
      result = compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "crashes":
      result = compareNumberValues(leftStats.crashes, rightStats.crashes)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "winRate":
      return compareRankRateRows(left, right, "winRate", rankSortState.direction);
    case "lossRate":
      return compareRankRateRows(left, right, "lossRate", rankSortState.direction);
    case "drawRate":
      return compareRankRateRows(left, right, "drawRate", rankSortState.direction);
    case "crashRate":
      return compareRankRateRows(left, right, "crashRate", rankSortState.direction);
    case "record":
      result = compareNumberValues(getRankRecordScore(left.account), getRankRecordScore(right.account))
        || compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "rank":
    default:
      result = compareNumberValues(left.rank, right.rank);
      break;
  }

  return applySortDirection(result, rankSortState.direction);
}

function comparePlayerGames(left, right, activeAccount) {
  let result = 0;

  switch (playerGamesSortState.key) {
    case "map":
      result = compareTextValues(left.mapName, right.mapName)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "result":
      result = compareNumberValues(
        PLAYER_GAME_RESULT_ORDER[getPlayerGameOutcome(left, activeAccount).label] || 0,
        PLAYER_GAME_RESULT_ORDER[getPlayerGameOutcome(right, activeAccount).label] || 0
      ) || compareNumberValues(left.endDate, right.endDate);
      break;
    case "duration":
      result = compareNumberValues(left.duration, right.duration)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "replay":
      result = compareTextValues(getReplaySortValue(left.replayUrl), getReplaySortValue(right.replayUrl))
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "date":
    default:
      result = compareNumberValues(left.endDate, right.endDate);
      break;
  }

  return applySortDirection(result, playerGamesSortState.direction);
}

function compareMatches(left, right) {
  let result = 0;

  switch (matchesSortState.key) {
    case "map":
      result = compareTextValues(left.mapName, right.mapName)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "players":
      result = compareNumberValues(getPlayerCount(left), getPlayerCount(right))
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "duration":
      result = compareNumberValues(left.duration, right.duration)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "replay":
      result = compareTextValues(getReplaySortValue(left.replayUrl), getReplaySortValue(right.replayUrl))
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "date":
    default:
      result = compareNumberValues(left.endDate, right.endDate);
      break;
  }

  return applySortDirection(result, matchesSortState.direction);
}

async function copyValueToClipboard(button) {
  const value = button.dataset.copyValue;
  if (!value) {
    return;
  }

  const hintElement = button.querySelector(".stats-copy-hint");
  const defaultText = button.dataset.copyDefault || "Click to copy";
  if (hintElement) {
    hintElement.textContent = defaultText;
  }

  try {
    await navigator.clipboard.writeText(value);
    button.classList.add("is-copied");
    button.classList.remove("is-failed");
    if (hintElement) {
      hintElement.textContent = "Copied";
    }
  } catch (error) {
    button.classList.add("is-failed");
    button.classList.remove("is-copied");
    if (hintElement) {
      hintElement.textContent = "Copy failed";
    }
  }

  window.clearTimeout(button.copyResetTimer);
  button.classList.add("is-feedback-visible");
  button.copyResetTimer = window.setTimeout(() => {
    button.classList.remove("is-copied", "is-failed", "is-feedback-visible");
    if (hintElement) {
      hintElement.textContent = defaultText;
    }
  }, 1400);
}

function bindCopyButtons(scope) {
  scope.querySelectorAll("[data-copy-value]").forEach((button) => {
    if (button.dataset.copyBound === "true") {
      return;
    }

    button.dataset.copyBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyValueToClipboard(button);
    });
  });
}

function renderPlayerGameDetails(game, activeAccount) {
  return `
    <div class="stats-player-game-detail-panel">
      <div class="stats-matchup stats-matchup-tiles">
        ${renderMatchup(game, {
          variant: "tiles",
          includePlayerPower: true,
          showVersus: false,
          highlightedAccountKey: activeAccount ? getAccountExpandKey(activeAccount) : "",
          clickablePlayerTiles: true,
          currentGameKey: getPlayerGameKey(game)
        })}
      </div>
    </div>
  `;
}

function getAccountGameSlot(game, account) {
  return (game.players || []).find((slot) => slot.account === account)
    || (game.slots || []).find((slot) => slot.account === account)
    || null;
}

function getCountedFavorites(values, limit = 3) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function formatPlayerMode(game) {
  const teamSizes = (game.teams || [])
    .map((team) => (team.players || []).length)
    .filter((size) => size > 0);
  if (teamSizes.length > 1 && teamSizes.every((size) => size === 1)) {
    return "FFA";
  }
  if (teamSizes.length > 1 && teamSizes.every((size) => size === teamSizes[0])) {
    return teamSizes.join("v");
  }
  return formatAlliance(game);
}

function getAccountEloHistory(account) {
  const points = [...account.games]
    .sort((left, right) => Number(left.endDate || 0) - Number(right.endDate || 0))
    .map((game) => {
      const slot = getAccountGameSlot(game, account);
      if (!Number.isFinite(slot?.elo)) {
        return null;
      }
      const delta = Number.isFinite(slot.eloDelta) ? slot.eloDelta : 0;
      return {
        date: Number(game.endDate || 0),
        value: slot.elo + delta
      };
    })
    .filter(Boolean);

  if (!account.discounted && Number.isFinite(account.elo)) {
    const lastPoint = points.at(-1);
    if (!lastPoint || Math.abs(lastPoint.value - account.elo) > 0.005) {
      points.push({ date: Number(lastPoint?.date || Date.now()), value: account.elo });
    }
  }

  return points;
}

function getCurrentWinStreak(account) {
  const games = [...(account?.games || [])]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0));
  let streak = 0;
  for (const game of games) {
    if (getPlayerGameOutcome(game, account).label !== "Won") {
      break;
    }
    streak += 1;
  }
  return streak;
}

function getPlayerResearchAverage(account) {
  const keys = [account?.mainPublicKey, ...(account?.publicKeys || []), account?.name];
  for (const key of keys) {
    const summary = PLAYER_RESEARCH_AVERAGES[String(key || "")];
    if (summary) {
      return summary;
    }
  }
  return null;
}

function filterRecentlyActiveAccounts(accountList, gameList = []) {
  let latestGameTimestamp = gameList.reduce((latest, game) => (
    Math.max(latest, Number(game?.endDate || 0))
  ), 0);

  if (!latestGameTimestamp) {
    latestGameTimestamp = accountList.reduce((latest, account) => (
      Math.max(
        latest,
        ...(account?.games || []).map((game) => Number(game?.endDate || 0))
      )
    ), 0);
  }

  const activityCutoff = latestGameTimestamp - PLAYER_ACTIVITY_WINDOW_MS;
  return accountList.filter((account) => (account?.games || []).some((game) => (
    Number(game?.endDate || 0) >= activityCutoff
  )));
}

function getRecentPlayerTrend(account, limit = 10) {
  const games = [...(account?.games || [])]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0))
    .slice(0, limit);
  const wins = games.filter((game) => getPlayerGameOutcome(game, account).label === "Won").length;
  const eloGain = games.reduce((total, game) => {
    const slot = getAccountGameSlot(game, account);
    return total + (Number.isFinite(slot?.eloDelta) ? slot.eloDelta : 0);
  }, 0);
  const upsetWins = account.games.filter((game) => (
    isUpsetMatch(game) && getPlayerGameOutcome(game, account).label === "Won"
  )).length;
  return {
    games: games.length,
    wins,
    winRate: games.length ? (wins / games.length) * 100 : 0,
    eloGain,
    streak: getCurrentWinStreak(account),
    upsetWins
  };
}

function renderEloSparkline(points) {
  if (!points.length) {
    return '<p class="stats-profile-empty">Rating Ratio begins after five ranked matches.</p>';
  }

  const width = 360;
  const height = 92;
  const inset = 7;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const denominator = Math.max(1, points.length - 1);
  const chartPoints = points.map((point, index) => {
    const x = inset + (index / denominator) * (width - inset * 2);
    const y = height - inset - ((point.value - minimum) / range) * (height - inset * 2);
    return { point, x, y };
  });
  const coordinates = chartPoints.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const hoverPoints = chartPoints.map(({ point, x, y }) => `
    <circle class="stats-profile-chart-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" data-chart-tooltip="${escapeHtml(formatShortDate(point.date))} - ${point.value.toFixed(2)}"></circle>
  `).join("");
  const latest = points.at(-1);

  return `
    <span class="stats-profile-chart-maximum">${maximum.toFixed(0)}</span>
    <svg class="stats-profile-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Rating Ratio from ${minimum.toFixed(0)} to ${maximum.toFixed(0)}">
      <polyline points="${coordinates}" vector-effect="non-scaling-stroke"></polyline>
      ${hoverPoints}
    </svg>
    <div class="stats-profile-chart-tooltip" hidden></div>
    <div class="stats-profile-chart-scale">
      <span>${minimum.toFixed(0)}</span>
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
    </div>
  `;
}

function initEloChartTooltip(container) {
  const chart = container?.querySelector(".stats-profile-chart");
  const tooltip = container?.querySelector(".stats-profile-chart-tooltip");
  const history = chart?.closest(".stats-profile-history");
  if (!chart || !tooltip || !history) return;

  chart.addEventListener("pointermove", (event) => {
    const point = event.target.closest?.(".stats-profile-chart-point");
    if (!point) {
      tooltip.hidden = true;
      return;
    }

    tooltip.textContent = point.dataset.chartTooltip || "";
    tooltip.hidden = false;
    const bounds = history.getBoundingClientRect();
    const tooltipBounds = tooltip.getBoundingClientRect();
    const halfWidth = tooltipBounds.width / 2;
    const left = Math.min(
      Math.max(event.clientX - bounds.left, halfWidth + 8),
      bounds.width - halfWidth - 8
    );
    const top = Math.max(24, event.clientY - bounds.top - tooltipBounds.height - 12);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });

  chart.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
  });
}

function getAccountOpponents(account) {
  const counts = new Map();
  account.games.forEach((game) => {
    const ownTeam = (game.teams || []).find((team) => (
      (team.players || []).some((slot) => slot.account === account)
    ));
    const opponents = ownTeam
      ? (game.teams || []).filter((team) => team !== ownTeam).flatMap((team) => team.players || [])
      : (game.players || []).filter((slot) => slot.account !== account);

    opponents.forEach((slot) => {
      if (!slot.account || slot.account === account) {
        return;
      }
      const key = getAccountExpandKey(slot.account);
      const current = counts.get(key) || { key, name: slot.account.name || "Unknown", count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5);
}

function getAccountTeammates(account) {
  const counts = new Map();
  account.games.forEach((game) => {
    const ownTeam = (game.teams || []).find((team) => (
      (team.players || []).some((slot) => slot.account === account)
    ));

    (ownTeam?.players || []).forEach((slot) => {
      if (!slot.account || slot.account === account) {
        return;
      }
      const key = getAccountExpandKey(slot.account);
      const current = counts.get(key) || { key, name: slot.account.name || "Unknown", count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5);
}

function renderProfileList(items, emptyLabel) {
  if (!items.length) {
    return `<span class="stats-profile-empty">${escapeHtml(emptyLabel)}</span>`;
  }
  return items.map(([label, count]) => (
    `<span class="stats-profile-chip">${escapeHtml(label)} <small>${count}</small></span>`
  )).join("");
}

function getMapMatchesUrl(mapName) {
  const mapUrl = new URL("index.html", window.location.href);
  const params = new URLSearchParams({
    matchesMap: mapName,
    tab: "recent-matches"
  });
  if (selectedLeaderboard !== "Global") {
    params.set("leaderboard", selectedLeaderboard);
  }
  mapUrl.search = params.toString();
  return mapUrl.href;
}

function renderMapFilterLink(mapName, label = mapName, className = "") {
  const linkClass = ["stats-map-filter-link", className].filter(Boolean).join(" ");
  return `<a class="${linkClass}" href="${escapeHtml(getMapMatchesUrl(mapName))}" target="_parent" aria-label="Show recent matches on ${escapeHtml(mapName)}">${escapeHtml(label)}</a>`;
}

function renderMapProfileLinks(items, emptyLabel) {
  if (!items.length) {
    return `<span class="stats-profile-empty">${escapeHtml(emptyLabel)}</span>`;
  }
  return items.map(([mapName, count]) => (
    `<a class="stats-map-filter-link stats-profile-chip stats-profile-compare-link" href="${escapeHtml(getMapMatchesUrl(mapName))}" target="_parent" aria-label="Show recent matches on ${escapeHtml(mapName)}">${escapeHtml(mapName)} <small>${count}</small></a>`
  )).join("");
}

function renderProfileComparisonLinks(account, items, emptyLabel) {
  if (!items.length) {
    return `<span class="stats-profile-empty">${escapeHtml(emptyLabel)}</span>`;
  }

  const accountKey = getAccountExpandKey(account);
  return items.map((item) => {
    const comparisonUrl = new URL("index.html", window.location.href);
    const params = new URLSearchParams();
    if (selectedLeaderboard !== "Global") {
      params.set("leaderboard", selectedLeaderboard);
    }
    setCompactComparisonParams(params, accountKey, item.key);
    comparisonUrl.search = params.toString();
    const comparisonLabel = `Compare ${account.name || "Unknown"} with ${item.name}`;
    return `<a class="stats-profile-chip stats-profile-compare-link" href="${escapeHtml(comparisonUrl.href)}" target="_parent" aria-label="${escapeHtml(comparisonLabel)}" title="${escapeHtml(comparisonLabel)}">${escapeHtml(item.name)} <small>${item.count}</small></a>`;
  }).join("");
}

function renderComparisonForm(account, limit = 8) {
  const outcomes = [...account.games]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0))
    .slice(0, limit)
    .map((game) => getPlayerGameOutcome(game, account));

  if (!outcomes.length) {
    return '<span class="stats-profile-empty">No recent form</span>';
  }

  return `<span class="stats-comparison-form">${outcomes.map((outcome) => (
    `<i class="${outcome.className}" title="${escapeHtml(outcome.label)}">${escapeHtml(outcome.label.charAt(0))}</i>`
  )).join("")}</span>`;
}

function getComparisonAccountData(account) {
  const stats = getAccountDisplayStats(account);
  const gameCount = getAccountDisplayGameCount(account);
  return {
    elo: account.discounted ? "Provisional" : account.elo.toFixed(2),
    winRate: formatRecordPercentage(stats.wins, gameCount),
    form: renderComparisonForm(account),
    maps: getCountedFavorites(account.games.map((game) => game.mapName)),
    opponents: getAccountOpponents(account)
  };
}

function renderComparisonOpponentLinks(account, opponents, side) {
  if (!opponents.length) {
    return '<span class="stats-profile-empty">No opponents</span>';
  }

  const accountKey = getAccountExpandKey(account);
  return opponents.map((opponent) => {
    const comparisonUrl = new URL("index.html", window.location.href);
    const params = new URLSearchParams();
    setCompactComparisonParams(
      params,
      side === "A" ? accountKey : opponent.key,
      side === "A" ? opponent.key : accountKey
    );
    if (selectedLeaderboard !== "Global") {
      params.set("leaderboard", selectedLeaderboard);
    }
    comparisonUrl.search = params.toString();
    const comparisonLabel = `Compare ${account.name || "Unknown"} with ${opponent.name}`;
    return `<a class="stats-profile-chip stats-profile-compare-link" href="${escapeHtml(comparisonUrl.href)}" target="_parent" aria-label="${escapeHtml(comparisonLabel)}" title="${escapeHtml(comparisonLabel)}">${escapeHtml(opponent.name)} <small>${opponent.count}</small></a>`;
  }).join("");
}

function areAccountsOpponents(game, accountA, accountB) {
  const teamA = (game.teams || []).find((team) => (
    (team.players || []).some((slot) => slot.account === accountA)
  ));
  const teamB = (game.teams || []).find((team) => (
    (team.players || []).some((slot) => slot.account === accountB)
  ));

  return Boolean(teamA && teamB && teamA !== teamB);
}

function renderPlayerComparison(accounts) {
  if (!playerComparisonElement) {
    return;
  }

  const selectableAccounts = filterVisibleAccounts(accounts);
  const accountByKey = new Map(selectableAccounts.map((account) => [getAccountExpandKey(account), account]));
  comparisonShareKeyByAccountKey = new Map(
    selectableAccounts.map((account) => {
      const accountKey = getAccountExpandKey(account);
      return [accountKey, getCompactAccountKey(accountKey)];
    })
  );
  const accountKeyByShareKey = new Map(
    [...comparisonShareKeyByAccountKey].map(([accountKey, shareKey]) => [shareKey, accountKey])
  );
  const resolveComparisonKey = (value) => (
    accountByKey.has(value) ? value : accountKeyByShareKey.get(value) || null
  );
  const activeAccount = accountByKey.get(activeExpandedAccountKey);

  comparePlayerAKey = resolveComparisonKey(comparePlayerAKey);
  comparePlayerBKey = resolveComparisonKey(comparePlayerBKey);

  if (!accountByKey.has(comparePlayerAKey)) {
    comparePlayerAKey = activeAccount ? getAccountExpandKey(activeAccount) : null;
  }
  if (!accountByKey.has(comparePlayerBKey)) {
    comparePlayerBKey = null;
  }

  const accountA = accountByKey.get(comparePlayerAKey);
  const accountB = accountByKey.get(comparePlayerBKey);
  const comparisonShareUrl = new URL("index.html", window.location.href);
  const comparisonShareParams = buildStateParams();
  if (!comparisonShareParams.has(COMPACT_COMPARISON_PARAM)) {
    comparisonShareParams.set("tab", "compare");
  }
  comparisonShareUrl.search = comparisonShareParams.toString();
  const renderOptions = (selectedKey, excludedKey, searchValue = "") => {
    const searchQuery = normalizeSearchQuery(searchValue);
    const getPrimaryNamePriority = (account) => {
      const name = String(account.name || "").toLowerCase();
      if (!searchQuery || name === searchQuery) {
        return 0;
      }
      if (name.startsWith(searchQuery)) {
        return 1;
      }
      return name.includes(searchQuery) ? 2 : 3;
    };
    const matchingAccounts = selectableAccounts.filter((account) => {
      const key = getAccountExpandKey(account);
      return key === selectedKey || matchesPlayerSearch(account, searchQuery);
    }).sort((left, right) => getPrimaryNamePriority(left) - getPrimaryNamePriority(right));
    const hasSearchMatches = matchingAccounts.some((account) => (
      matchesPlayerSearch(account, searchQuery)
    ));
    return `
    <option value="">${searchQuery && !hasSearchMatches ? "No matching players" : "Select player"}</option>
    ${matchingAccounts.map((account) => {
      const key = getAccountExpandKey(account);
      const elo = account.discounted ? "provisional" : account.elo.toFixed(0);
      const isSearchMatch = matchesPlayerSearch(account, searchQuery);
      return `<option value="${escapeHtml(key)}" data-search-match="${isSearchMatch ? "true" : "false"}"${key === selectedKey ? " selected" : ""}${key === excludedKey ? " disabled" : ""}>${escapeHtml(account.name || "Unknown")} · ${elo} ELO</option>`;
    }).join("")}
  `;
  };

  let comparisonBody = '<p class="stats-comparison-empty">Select two players to compare their performance in this leaderboard slice.</p>';
  if (accountA && accountB && accountA !== accountB) {
    const dataA = getComparisonAccountData(accountA);
    const dataB = getComparisonAccountData(accountB);
    const headToHeadGames = accountA.games.filter((game) => areAccountsOpponents(game, accountA, accountB));
    const winsA = headToHeadGames.filter((game) => getPlayerGameOutcome(game, accountA).label === "Won").length;
    const winsB = headToHeadGames.filter((game) => getPlayerGameOutcome(game, accountB).label === "Won").length;
    const otherResults = Math.max(0, headToHeadGames.length - winsA - winsB);
    const winsAPercentage = headToHeadGames.length ? (winsA / headToHeadGames.length) * 100 : 0;
    const winsBPercentage = headToHeadGames.length ? (winsB / headToHeadGames.length) * 100 : 0;
    const otherPercentage = headToHeadGames.length ? (otherResults / headToHeadGames.length) * 100 : 0;
    const playerOneBarClass = winsA === winsB ? "is-tied" : winsA > winsB ? "is-winner" : "is-loser";
    const playerTwoBarClass = winsA === winsB ? "is-tied" : winsB > winsA ? "is-winner" : "is-loser";

    comparisonBody = `
      <div class="stats-comparison-grid">
        <strong>${escapeHtml(accountA.name || "Unknown")}</strong>
        <span class="stats-comparison-metric">Metric</span>
        <strong>${escapeHtml(accountB.name || "Unknown")}</strong>
        <span>${escapeHtml(dataA.elo)}</span><b>Current ELO</b><span>${escapeHtml(dataB.elo)}</span>
        <span>${escapeHtml(dataA.winRate)}</span><b>Win rate</b><span>${escapeHtml(dataB.winRate)}</span>
        <span>${dataA.form}</span><b>Recent form</b><span>${dataB.form}</span>
        <span class="stats-comparison-list">${renderMapProfileLinks(dataA.maps, "No map history")}</span><b>Favorite maps</b><span class="stats-comparison-list">${renderMapProfileLinks(dataB.maps, "No map history")}</span>
        <span class="stats-comparison-list">${renderComparisonOpponentLinks(accountA, dataA.opponents, "A")}</span><b>Top opponents</b><span class="stats-comparison-list">${renderComparisonOpponentLinks(accountB, dataB.opponents, "B")}</span>
      </div>
      <div class="stats-comparison-head-to-head">
        <span>Head to head</span>
        <div class="stats-comparison-head-to-head-result">
          <strong>${winsA} wins (${winsAPercentage.toFixed(0)}%) · ${otherResults} other (${otherPercentage.toFixed(0)}%) · ${winsB} wins (${winsBPercentage.toFixed(0)}%)</strong>
          <span class="stats-comparison-percentage-bar" role="img" aria-label="${escapeHtml(accountA.name || "Player one")} ${winsAPercentage.toFixed(0)} percent, other results ${otherPercentage.toFixed(0)} percent, ${escapeHtml(accountB.name || "Player two")} ${winsBPercentage.toFixed(0)} percent">
            <i class="${playerOneBarClass}" style="width: ${winsAPercentage}%"></i>
            <i class="is-other" style="width: ${otherPercentage}%"></i>
            <i class="${playerTwoBarClass}" style="width: ${winsBPercentage}%"></i>
          </span>
        </div>
        <small>${headToHeadGames.length} shared matches</small>
      </div>
    `;
  }

  playerComparisonElement.innerHTML = `
    <div class="stats-comparison-heading">
      <div><span class="stats-detail-label">Player comparison</span><strong>Compare two players</strong></div>
      ${accountA && accountB
        ? `<button class="stats-profile-share" type="button" data-comparison-url="${escapeHtml(comparisonShareUrl.href)}">Copy comparison link</button>`
        : "<small>Select two players to create a shareable link</small>"}
    </div>
    <div class="stats-comparison-selects">
      <div class="stats-comparison-picker">
        <span>Player one</span>
        <div class="stats-comparison-picker-controls">
          <div class="stats-comparison-search-wrap">
            <input id="statsCompareSearchA" type="search" placeholder="Search nickname or key" autocomplete="off" aria-label="Search player one" aria-controls="statsCompareSuggestionsA" aria-expanded="false">
            <div class="stats-comparison-suggestions" id="statsCompareSuggestionsA" role="listbox" hidden></div>
          </div>
          <select id="statsComparePlayerA" aria-label="Player one">${renderOptions(comparePlayerAKey, comparePlayerBKey)}</select>
        </div>
      </div>
      <span aria-hidden="true">VS</span>
      <div class="stats-comparison-picker">
        <span>Player two</span>
        <div class="stats-comparison-picker-controls">
          <div class="stats-comparison-search-wrap">
            <input id="statsCompareSearchB" type="search" placeholder="Search nickname or key" autocomplete="off" aria-label="Search player two" aria-controls="statsCompareSuggestionsB" aria-expanded="false">
            <div class="stats-comparison-suggestions" id="statsCompareSuggestionsB" role="listbox" hidden></div>
          </div>
          <select id="statsComparePlayerB" aria-label="Player two">${renderOptions(comparePlayerBKey, comparePlayerAKey)}</select>
        </div>
      </div>
    </div>
    ${comparisonBody}
  `;

  const bindComparisonSearch = (inputId, selectId, suggestionsId, selectedKey, excludedKey) => {
    const input = playerComparisonElement.querySelector(inputId);
    const select = playerComparisonElement.querySelector(selectId);
    const suggestions = playerComparisonElement.querySelector(suggestionsId);
    const hideSuggestions = () => {
      if (!suggestions || !input) {
        return;
      }
      suggestions.hidden = true;
      input.setAttribute("aria-expanded", "false");
    };
    const renderSuggestions = () => {
      if (!input || !select || !suggestions) {
        return;
      }
      const query = input.value.trim();
      if (!query) {
        hideSuggestions();
        return;
      }
      const matches = [...select.options]
        .filter((option) => option.dataset.searchMatch === "true" && !option.disabled && option.value)
        .slice(0, 6);
      suggestions.innerHTML = matches.length
        ? matches.map((option) => `<button type="button" role="option" data-player-key="${escapeHtml(option.value)}">${escapeHtml(option.textContent)}</button>`).join("")
        : '<span>No matching players</span>';
      suggestions.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    input?.addEventListener("input", (event) => {
      select.innerHTML = renderOptions(select.value || selectedKey, excludedKey, event.currentTarget.value);
      renderSuggestions();
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideSuggestions();
        return;
      }
      if (event.key !== "Enter") {
        return;
      }
      const firstMatch = [...select.options].find((option) => (
        option.dataset.searchMatch === "true" && !option.disabled
      ));
      if (!firstMatch) {
        return;
      }
      event.preventDefault();
      select.value = firstMatch.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input?.addEventListener("focus", renderSuggestions);
    input?.addEventListener("blur", () => window.setTimeout(hideSuggestions, 120));
    suggestions?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-player-key]");
      if (!option) {
        return;
      }
      select.value = option.dataset.playerKey;
      hideSuggestions();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  bindComparisonSearch("#statsCompareSearchA", "#statsComparePlayerA", "#statsCompareSuggestionsA", comparePlayerAKey, comparePlayerBKey);
  bindComparisonSearch("#statsCompareSearchB", "#statsComparePlayerB", "#statsCompareSuggestionsB", comparePlayerBKey, comparePlayerAKey);

  playerComparisonElement.querySelector("#statsComparePlayerA")?.addEventListener("change", (event) => {
    comparePlayerAKey = event.currentTarget.value || null;
    render();
  });
  playerComparisonElement.querySelector("#statsComparePlayerB")?.addEventListener("change", (event) => {
    comparePlayerBKey = event.currentTarget.value || null;
    render();
  });

  const comparisonShareButton = playerComparisonElement.querySelector("[data-comparison-url]");
  comparisonShareButton?.addEventListener("click", async () => {
    const shareUrl = comparisonShareButton.dataset.comparisonUrl;
    const fallbackInput = document.createElement("textarea");
    fallbackInput.value = shareUrl;
    fallbackInput.setAttribute("readonly", "");
    fallbackInput.style.position = "fixed";
    fallbackInput.style.opacity = "0";
    document.body.append(fallbackInput);
    fallbackInput.select();
    let copied = document.execCommand("copy");
    fallbackInput.remove();

    if (!copied) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }
    comparisonShareButton.textContent = copied ? "Link copied" : "Copy failed";
    window.setTimeout(() => { comparisonShareButton.textContent = "Copy comparison link"; }, 1400);
  });
}

function renderPlayerProfile(account) {
  destroyFavoriteUnitPreview();
  const shareButton = document.getElementById("statsProfileShare");
  if (!playerProfileElement || !account) {
    if (playerProfileElement) {
      playerProfileElement.hidden = true;
      playerProfileElement.innerHTML = "";
    }
    if (shareButton) {
      shareButton.hidden = true;
      shareButton.onclick = null;
    }
    return;
  }

  const displayStats = getAccountDisplayStats(account);
  const gameCount = getAccountDisplayGameCount(account);
  const eloHistory = getAccountEloHistory(account);
  const peakElo = eloHistory.length ? Math.max(...eloHistory.map((point) => point.value)) : null;
  const averageResearch = getPlayerResearchAverage(account);
  const recentGames = [...account.games]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0));
  const currentWinStreak = getCurrentWinStreak(account);
  const recentOutcomes = recentGames
    .slice(0, 10)
    .map((game) => getPlayerGameOutcome(game, account));
  const favoriteMaps = getCountedFavorites(account.games.map((game) => game.mapName));
  const favoriteModes = getCountedFavorites(account.games.map(formatPlayerMode));
  const isGlobalLeaderboard = (new URLSearchParams(window.location.search).get("leaderboard") || "Global") === "Global";
  const profileFavoriteUnits = isGlobalLeaderboard
    ? getGlobalFavoriteUnits(account)
    : account.favoriteUnits;
  const favoriteUnitCandidates = Array.isArray(profileFavoriteUnits)
  ? profileFavoriteUnits
      .filter((unit) => {
        const droidType = Number.parseInt(String(unit?.signature || "").split(":", 1)[0], 10);
        return droidType !== 3 && droidType !== 10;
      })
  : [];
  const favoriteUnits = favoriteUnitCandidates.slice(0, 10);
  const opponents = getAccountOpponents(account);
  const teammates = getAccountTeammates(account);
  const profileUrl = new URL("index.html", window.location.href);
  profileUrl.search = "";
  profileUrl.searchParams.set(
    COMPACT_PLAYER_PARAM,
    getCompactAccountKey(getAccountExpandKey(account)).replace(/^p/, "")
  );

  playerProfileElement.hidden = false;
  playerProfileElement.innerHTML = `
    <div class="stats-profile-metrics">
      <article><span>Current ELO</span><strong>${account.discounted ? "Provisional" : account.elo.toFixed(2)}</strong></article>
      <article><span>Best ELO</span><strong>${peakElo == null ? "--" : peakElo.toFixed(2)}</strong></article>
      <article><span>Win / loss</span><strong>${formatRecordPercentage(displayStats.wins, gameCount)} / ${formatRecordPercentage(displayStats.losses, gameCount)}</strong></article>
      <article title="${averageResearch ? `Average research-lab activity across ${averageResearch.games} recorded ${averageResearch.games === 1 ? "game" : "games"}.` : "No recorded research telemetry."}"><span>Avg research</span><strong>${averageResearch ? `${averageResearch.average.toFixed(2)}%` : "--"}</strong></article>
      <article><span>Win streak</span><strong>${currentWinStreak} ${currentWinStreak === 1 ? "win" : "wins"}</strong></article>
      <article class="stats-profile-form"><span>Recent form</span><strong>${recentOutcomes.map((outcome) => `<i class="${outcome.className}" title="${escapeHtml(outcome.label)}">${escapeHtml(outcome.label.charAt(0))}</i>`).join("") || "--"}</strong></article>
    </div>
    <div class="stats-profile-details">
      <article class="stats-profile-history">
        <span class="stats-detail-label">Rating Ratio</span>
        ${renderEloSparkline(eloHistory)}
      </article>
      <div data-favorite-unit-preview style="grid-column: 1 / -1;"></div>
      <article><span class="stats-detail-label">Favorite maps</span><div>${renderMapProfileLinks(favoriteMaps, "No map history")}</div></article>
      <article><span class="stats-detail-label">Favorite modes</span><div>${renderProfileList(favoriteModes, "No mode history")}</div></article>
      <article><span class="stats-detail-label">Most-played opponents</span><div>${renderProfileComparisonLinks(account, opponents, "No opponents")}</div></article>
      <article><span class="stats-detail-label">Most-played teammates</span><div>${renderProfileComparisonLinks(account, teammates, "No teammates")}</div></article>
    </div>
  `;

  initEloChartTooltip(playerProfileElement);

  initFavoriteUnitPreview(
    playerProfileElement.querySelector("[data-favorite-unit-preview]"),
    favoriteUnitCandidates,
    getFavoriteUnitNameCandidates()
  );

  if (shareButton) {
    shareButton.hidden = false;
    shareButton.dataset.profileUrl = profileUrl.href;
    shareButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareButton.dataset.profileUrl);
        shareButton.textContent = "Link copied";
      } catch {
        shareButton.textContent = "Copy failed";
      }
      window.setTimeout(() => { shareButton.textContent = "Copy profile link"; }, 1400);
    };
  }
}

function parseOptionalNumber(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function getMatchTeamStrengths(game) {
  return (game.teams || [])
    .filter((team) => Array.isArray(team.players) && team.players.length)
    .map((team) => ({
      team,
      strength: getTeamStrengthPercent(team),
      userType: getNormalizedTeamUserType(game, team)
    }));
}

function getMatchTeamPowerDifference(game) {
  const strengths = getMatchTeamStrengths(game)
    .map(({ strength }) => strength)
    .filter((strength) => Number.isFinite(strength));
  if (strengths.length < 2) {
    return null;
  }

  return Math.max(...strengths) - Math.min(...strengths);
}

function isUpsetMatch(game) {
  const strengths = getMatchTeamStrengths(game);
  const winnerStrengths = strengths
    .filter(({ userType, strength }) => userType === "winner" && Number.isFinite(strength))
    .map(({ strength }) => strength);
  const opponentStrengths = strengths
    .filter(({ userType, strength }) => userType !== "winner" && Number.isFinite(strength))
    .map(({ strength }) => strength);

  return winnerStrengths.length > 0
    && opponentStrengths.length > 0
    && Math.max(...winnerStrengths) < Math.max(...opponentStrengths);
}

function parseFilterDate(value, includeWholeDay = false) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (includeWholeDay) {
    date.setDate(date.getDate() + 1);
  }
  return date.getTime();
}

function matchesAdvancedFilters(game) {
  const fromTime = parseFilterDate(matchesDateFrom);
  const toTime = parseFilterDate(matchesDateTo, true);
  const gameTime = Number(game.endDate || 0);
  const durationMinutes = Number(game.duration || 0) / 60_000;
  const playerCount = getPlayerCount(game);
  const minDuration = parseOptionalNumber(matchesMinDuration);
  const maxDuration = parseOptionalNumber(matchesMaxDuration);
  const minPlayers = parseOptionalNumber(matchesMinPlayers);
  const maxPlayers = parseOptionalNumber(matchesMaxPlayers);
  const minPowerGap = parseOptionalNumber(matchesMinPowerGap);

  if (fromTime != null && gameTime < fromTime) {
    return false;
  }
  if (toTime != null && gameTime >= toTime) {
    return false;
  }
  if (matchesMap && game.mapName !== matchesMap) {
    return false;
  }
  if (minDuration != null && durationMinutes < minDuration) {
    return false;
  }
  if (maxDuration != null && durationMinutes > maxDuration) {
    return false;
  }
  if (minPlayers != null && playerCount < minPlayers) {
    return false;
  }
  if (maxPlayers != null && playerCount > maxPlayers) {
    return false;
  }
  if (minPowerGap != null) {
    const powerDifference = getMatchTeamPowerDifference(game);
    if (!Number.isFinite(powerDifference) || powerDifference < minPowerGap) {
      return false;
    }
  }
  if (matchesUpsetsOnly && !isUpsetMatch(game)) {
    return false;
  }

  return true;
}

function getActiveMatchFilterCount() {
  return [
    matchesDateFrom,
    matchesDateTo,
    matchesMap,
    matchesMinDuration,
    matchesMaxDuration,
    matchesMinPlayers,
    matchesMaxPlayers,
    matchesMinPowerGap,
    matchesUpsetsOnly
  ].filter(Boolean).length;
}

function getPlayerLeaderboardRanks(account) {
  if (!account || !leaderboardData?.leaderboards) {
    return [];
  }

  const accountKey = getAccountExpandKey(account);
  const leaderboards = runtime.leaderboards?.length
    ? runtime.leaderboards
    : Object.keys(leaderboardData.leaderboards);

  return leaderboards.flatMap((leaderboard) => {
    const { accounts } = hydratePublishedBoard(leaderboard);
    const rankedAccounts = filterVisibleAccounts(sortAccounts(accounts.values()));
    const rankIndex = rankedAccounts.findIndex((candidate) => getAccountExpandKey(candidate) === accountKey);
    return rankIndex >= 0 ? [{ leaderboard, rank: rankIndex + 1 }] : [];
  });
}

function renderPlayerRankMenu(account, currentRank) {
  const ranks = getPlayerLeaderboardRanks(account);
  const options = ranks.length
    ? ranks.map(({ leaderboard, rank }) => `
        <button
          class="stats-player-rank-option${leaderboard === selectedLeaderboard ? " is-active" : ""}"
          type="button"
          data-player-rank-leaderboard="${escapeHtml(leaderboard)}"
        >
          <span>${escapeHtml(leaderboard)}</span>
          <strong>#${rank}</strong>
        </button>
      `).join("")
    : '<span class="stats-player-rank-empty">No ranked filters</span>';

  return `
    <span class="stats-player-profile-rank">
      <span class="stats-player-rank-menu">
        <button
          class="stats-player-rank-trigger"
          type="button"
          aria-expanded="false"
          aria-haspopup="menu"
          aria-label="View ${escapeHtml(account.name || "player")} ranks across filters"
        >
          <span class="stats-detail-label stats-player-profile-rank-label">Rank</span>
          <strong>#${currentRank || "--"}</strong>
          <span class="stats-player-rank-chevron" aria-hidden="true"></span>
        </button>
        <span class="stats-player-rank-popup" role="menu" hidden>${options}</span>
      </span>
    </span>
  `;
}

function bindPlayerRankMenu() {
  const rankMenu = playerGamesTitleElement?.querySelector(".stats-player-rank-menu");
  const trigger = rankMenu?.querySelector(".stats-player-rank-trigger");
  const popup = rankMenu?.querySelector(".stats-player-rank-popup");
  if (!rankMenu || !trigger || !popup) {
    return;
  }

  const setOpen = (open) => {
    popup.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    rankMenu.classList.toggle("is-open", open);
  };

  trigger.addEventListener("click", () => {
    setOpen(trigger.getAttribute("aria-expanded") !== "true");
  });

  popup.addEventListener("click", (event) => {
    const option = event.target.closest("[data-player-rank-leaderboard]");
    if (!option) {
      return;
    }

    const leaderboard = option.dataset.playerRankLeaderboard;
    setOpen(false);
    if (!leaderboard || selectedLeaderboard === leaderboard) {
      return;
    }

    visiblePlayerCount = INITIAL_PLAYER_LIMIT;
    visibleMatchCount = INITIAL_MATCH_LIMIT;
    resetPlayerGamesView();
    selectedLeaderboard = leaderboard;
    updateActiveButtons();
    render();
  });

  rankMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      trigger.focus();
    }
  });

  rankMenu.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!rankMenu.contains(document.activeElement)) {
        setOpen(false);
      }
    }, 0);
  });
}

function renderPlayerGames(accounts, globalAccounts = accounts) {
  if (!playerGamesElement || !playerGamesTitleElement || !playerGamesMetaElement) {
    return;
  }

  const playerGamesHeader = playerGamesElement.closest("table")?.querySelector("thead tr");
  if (playerGamesHeader && !playerGamesHeader.querySelector("[data-player-games-elo-header]")) {
    const eloHeader = document.createElement("th");
    eloHeader.dataset.playerGamesEloHeader = "";
    eloHeader.textContent = "Elo";
    const durationHeader = playerGamesHeader.querySelector('[data-sort-key="duration"]');
    playerGamesHeader.insertBefore(eloHeader, durationHeader);
  }

  const profileHeadingLabel = document.querySelector(".stats-player-profile-heading-line .panel-kicker");
  const activeAccount = accounts.find((account) => getAccountExpandKey(account) === activeExpandedAccountKey);
  const selectedAccount = globalAccounts.find((account) => getAccountExpandKey(account) === activeExpandedAccountKey);
  if (!activeAccount && selectedAccount) {
    if (profileHeadingLabel) {
      profileHeadingLabel.innerHTML = `<span class="stats-player-profile-heading-name">${escapeHtml(selectedAccount.name || "Player")}</span>`;
    }
    playerGamesTitleElement.innerHTML = `
      <span class="stats-player-profile-leaderboard">${escapeHtml(selectedLeaderboard)}</span>
      <span class="stats-player-profile-state">No data</span>
      ${renderPlayerRankMenu(selectedAccount, 0)}
    `;
    bindPlayerRankMenu();
    playerGamesMetaElement.textContent = `No data for this player in the ${selectedLeaderboard} leaderboard.`;
    if (playerGamesActionsElement) {
      playerGamesActionsElement.innerHTML = "";
    }
    renderPlayerProfile(selectedAccount);
    playerProfileElement.innerHTML = `
      <p class="stats-profile-no-data">No data for ${escapeHtml(selectedAccount.name || "this player")} in the ${escapeHtml(selectedLeaderboard)} leaderboard.</p>
    `;
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">No match data for this player in the ${escapeHtml(selectedLeaderboard)} leaderboard.</td>
      </tr>
    `;
    return;
  }
  if (!activeAccount) {
    activeExpandedAccountKey = null;
    resetPlayerGamesView();
    expandedAccounts.clear();
    if (profileHeadingLabel) {
      profileHeadingLabel.textContent = "Player Profile";
    }
    playerGamesTitleElement.innerHTML = '<span class="stats-player-profile-empty-title">Select a player to open their profile</span>';
    playerGamesMetaElement.textContent = "The selected player's latest matches will appear here.";
    if (playerGamesActionsElement) {
      playerGamesActionsElement.innerHTML = "";
    }
    renderPlayerProfile(null);
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">Use + on a player to show their latest games here.</td>
      </tr>
    `;
    return;
  }

  renderPlayerProfile(activeAccount);

  const sortedGames = [...activeAccount.games].sort((left, right) => comparePlayerGames(left, right, activeAccount));
  let latestGames = showingAllPlayerGames
    ? sortedGames
    : sortedGames.slice(0, PLAYER_GAME_LIMIT);

  if (activeExpandedPlayerGameKey) {
    const expandedGame = sortedGames.find((game) => getPlayerGameKey(game) === activeExpandedPlayerGameKey);
    if (expandedGame && !latestGames.some((game) => getPlayerGameKey(game) === activeExpandedPlayerGameKey)) {
      latestGames = [
        expandedGame,
        ...latestGames.filter((game) => getPlayerGameKey(game) !== activeExpandedPlayerGameKey)
      ].slice(0, showingAllPlayerGames ? sortedGames.length : PLAYER_GAME_LIMIT);
    }
  }

  const latestGameKeys = new Set(latestGames.map(getPlayerGameKey));

  if (activeExpandedPlayerGameKey && !latestGameKeys.has(activeExpandedPlayerGameKey)) {
    activeExpandedPlayerGameKey = null;
  }

  const playerRank = filterVisibleAccounts(accounts).indexOf(activeAccount) + 1;
  if (profileHeadingLabel) {
    profileHeadingLabel.innerHTML = `<span class="stats-player-profile-heading-name">${escapeHtml(activeAccount.name || "Player")}</span>`;
  }
  playerGamesTitleElement.innerHTML = `
    <span class="stats-player-profile-leaderboard">${escapeHtml(selectedLeaderboard)}</span>
    ${renderPlayerRankMenu(activeAccount, playerRank)}
  `;
  bindPlayerRankMenu();
  playerGamesMetaElement.textContent = showingAllPlayerGames
    ? `All ${latestGames.length} matches in the ${selectedLeaderboard} slice.`
    : `Latest ${latestGames.length} matches in the ${selectedLeaderboard} slice.`;
  renderPlayerGameActions(sortedGames.length);

  if (!latestGames.length) {
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="6">No recent games found for this player in the selected slice.</td>
      </tr>
    `;
    return;
  }

  playerGamesElement.innerHTML = latestGames
    .map((game) => {
      const outcome = getPlayerGameOutcome(game, activeAccount);
      const activePlayerSlot = game.teams
        .flatMap((team) => Array.isArray(team.players) ? team.players : [])
        .find((slot) => slot?.account === activeAccount);
      const rawEloDelta = activePlayerSlot?.eloDelta;
      const hasEloDelta = rawEloDelta !== null
        && rawEloDelta !== undefined
        && Number.isFinite(Number(rawEloDelta));
      const eloDelta = hasEloDelta ? Number(rawEloDelta) : null;
      const eloDeltaLabel = hasEloDelta
        ? `${eloDelta > 0 ? "+" : ""}${eloDelta.toFixed(2)}`
        : "";
      const replayUrl = game.replayUrl ? normalizeReplayUrl(game.replayUrl) : "";
      const gameKey = getPlayerGameKey(game);
      const isExpanded = activeExpandedPlayerGameKey === gameKey;
      const detailRow = isExpanded
        ? `
          <tr class="stats-player-game-detail-row">
            <td colspan="6">
              ${renderPlayerGameDetails(game, activeAccount)}
            </td>
          </tr>
        `
        : "";

      return `
        <tr class="stats-player-game-row${isExpanded ? " is-expanded" : ""}" data-player-game-key="${escapeHtml(gameKey)}">
          <td class="stats-date">
            ${escapeHtml(formatMatchDate(game.endDate))}
            <span class="stats-date-time">${escapeHtml(formatMatchTime(game.endDate))}</span>
            <button
              class="stats-expand-toggle stats-player-game-toggle"
              type="button"
              aria-expanded="${isExpanded ? "true" : "false"}"
            >
              <span aria-hidden="true">${isExpanded ? "-" : "+"}</span>
              <span class="visually-hidden">${isExpanded ? "Close match details" : "Open match details"}</span>
            </button>
          </td>
          <td>
            <span class="stats-player-game-map">
              ${renderMapFilterLink(game.mapName)}
              ${game.mods
                ? `
                  <button
                    class="stats-map-mod stats-copy-chip"
                    type="button"
                    data-copy-value="${escapeHtml(game.mods)}"
                    data-copy-default="Click to copy"
                    aria-label="Copy mod data"
                  >
                    mod
                    <span class="stats-copy-hint" aria-hidden="true">Click to copy</span>
                  </button>
                `
                : ""}
            </span>
          </td>
          <td><span class="stats-tag stats-player-game-result ${outcome.className}">${escapeHtml(outcome.label)}${isUpsetMatch(game)
            ? '<span class="stats-mega-win-star" title="Mega win: the lower-powered team won." aria-label="Mega win">&#9733;</span>'
            : ""}</span></td>
          <td>${hasEloDelta
            ? `<span class="stats-player-game-elo-change ${eloDelta >= 0 ? "is-positive" : "is-negative"}" title="Match Elo change">${escapeHtml(eloDeltaLabel)}</span>`
            : ""}</td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td>
            ${replayUrl
              ? `<a class="stats-replay-link" href="${escapeHtml(replayUrl)}" data-replay-analyzer-url="${escapeHtml(replayUrl)}">Analyze</a>`
              : `<span class="stats-note">Unavailable</span>`}
          </td>
        </tr>
        ${detailRow}
      `;
    })
    .join("");

  playerGamesElement.querySelectorAll(".stats-player-game-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }

      const { playerGameKey } = row.dataset;
      if (!playerGameKey) {
        return;
      }

      activeExpandedPlayerGameKey = activeExpandedPlayerGameKey === playerGameKey
        ? null
        : playerGameKey;

      renderPlayerGames(accounts);
    });
  });

  bindCopyButtons(playerGamesElement);

  playerGamesElement.querySelectorAll(".stats-team-tile[data-jump-account]").forEach((tile) => {
    tile.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const { jumpAccount, jumpGame } = tile.dataset;
      if (!jumpAccount) {
        return;
      }

      const targetAccount = accounts.find((account) => getAccountExpandKey(account) === jumpAccount);
      if (!targetAccount) {
        return;
      }

      playerSearchQuery = String(targetAccount.name || "");
      if (playerSearchElement) {
        playerSearchElement.value = playerSearchQuery;
      }

      const eligibleAccounts = filterVisibleAccounts(accounts);
      const targetIndex = eligibleAccounts.findIndex((account) => getAccountExpandKey(account) === jumpAccount);
      if (targetIndex >= 0) {
        visiblePlayerCount = Math.max(visiblePlayerCount, targetIndex + 1);
      }

      activeExpandedAccountKey = jumpAccount;
      expandedAccounts = new Set([jumpAccount]);
      showingAllPlayerGames = false;
      activeExpandedPlayerGameKey = jumpGame || null;
      render();
    });
  });
}

function renderPlayerGameActions(totalGames) {
  if (!playerGamesActionsElement) {
    return;
  }

  if (!totalGames) {
    playerGamesActionsElement.innerHTML = "";
    return;
  }

  const shownCount = showingAllPlayerGames
    ? totalGames
    : Math.min(PLAYER_GAME_LIMIT, totalGames);

  if (totalGames <= PLAYER_GAME_LIMIT) {
    playerGamesActionsElement.innerHTML = `
      <span class="stats-panel-note">Showing all ${totalGames} player games.</span>
    `;
    return;
  }

  if (showingAllPlayerGames) {
    playerGamesActionsElement.innerHTML = `
      <span class="stats-panel-note">Showing all ${totalGames} player games.</span>
      <button class="stats-load-more" id="statsPlayerGamesShowLess" type="button">Show less</button>
    `;

    const showLessButton = playerGamesActionsElement.querySelector("#statsPlayerGamesShowLess");
    if (!showLessButton) {
      return;
    }

    showLessButton.addEventListener("click", () => {
      showingAllPlayerGames = false;
      render();
    });
    return;
  }

  playerGamesActionsElement.innerHTML = `
    <span class="stats-panel-note">Showing latest ${shownCount} of ${totalGames} player games.</span>
    <button class="stats-load-more" id="statsPlayerGamesShowAll" type="button">Show all (${totalGames})</button>
  `;

  const showAllButton = playerGamesActionsElement.querySelector("#statsPlayerGamesShowAll");
  if (!showAllButton) {
    return;
  }

  showAllButton.addEventListener("click", () => {
    showingAllPlayerGames = true;
    render();
  });
}

function renderMatchup(game, options = {}) {
  const {
    variant = "chips",
    includePlayerPower = false,
    linkToLeaderboard = false,
    showVersus = true,
    highlightedAccountKey = "",
    clickablePlayerTiles = false,
    currentGameKey = "",
    showTeamStrength = true
  } = options;
  const teams = game.teams.filter((team) => team.players.length);
  if (!teams.length) {
    return `<span class="stats-note">Player list unavailable.</span>`;
  }
  const teamStrengths = teams.map((team) => getTeamStrengthPercent(team));
  const validTeamStrengths = teamStrengths.filter((value) => Number.isFinite(value));
  const weakestTeamStrength = validTeamStrengths.length ? Math.min(...validTeamStrengths) : null;
  const strongestTeamStrength = validTeamStrengths.length ? Math.max(...validTeamStrengths) : null;

  const renderUpsetBadge = (team, strengthPercent) => {
    if (!showTeamStrength) {
      return "";
    }
    const isUpsetWinner = getNormalizedTeamUserType(game, team) === "winner"
      && Number.isFinite(strengthPercent)
      && strengthPercent === weakestTeamStrength
      && weakestTeamStrength < strongestTeamStrength;
    return isUpsetWinner
      ? '<span class="stats-upset-victory" title="Mega win: the lower-powered team won." aria-label="Mega win">&#9733; Mega win!</span>'
      : "";
  };

  const renderPlayerLabel = (player) => {
    const playerName = player.account?.name || "Unknown";
    const powerSuffix = includePlayerPower ? ` [${getPlayerPowerLabel(player.account)}]` : "";
    const playerLabel = `${escapeHtml(playerName)}${escapeHtml(powerSuffix)}`;
    if (!linkToLeaderboard || !player.account) {
      return playerLabel;
    }

    const playerParams = new URLSearchParams({
      playerSearch: playerName,
      player: getAccountExpandKey(player.account)
    });
    return `<a class="stats-team-player-link" href="index.html?${escapeHtml(playerParams.toString())}" target="_parent" aria-label="Open ${escapeHtml(playerName)} on Leaderboards">${playerLabel}</a>`;
  };

  if (variant === "tiles") {
    return `
      <div class="stats-matchup-list stats-matchup-list-tiles">
        ${teams.map((team, index) => {
          const strengthPercent = teamStrengths[index];
          return `
          <div class="stats-team-grid">
            <div class="stats-team-players">
              ${team.players
                .map((player) => {
                  const isHighlighted = highlightedAccountKey
                    && player.account
                    && getAccountExpandKey(player.account) === highlightedAccountKey;
                  const jumpAccount = clickablePlayerTiles && player.account
                    ? getAccountExpandKey(player.account)
                    : "";
                  const tileTag = jumpAccount ? "button" : "span";
                  const tileAttrs = jumpAccount
                    ? `type="button" data-jump-account="${escapeHtml(jumpAccount)}" data-jump-game="${escapeHtml(currentGameKey)}"`
                    : "";
                  return `
                  <${tileTag} class="stats-team-tile ${getTeamToneClass(getNormalizedTeamUserType(game, team))}${isHighlighted ? " is-current-player" : ""}${jumpAccount ? " is-clickable-player" : ""}" ${tileAttrs}>
                    ${renderPlayerLabel(player)}
                  </${tileTag}>
                `;
                })
                .join("")}
            </div>
            ${showTeamStrength ? `<span class="stats-team-strength ${getTeamStrengthToneClass(strengthPercent, teamStrengths)}">
              Team power: ${escapeHtml(Number.isFinite(strengthPercent) ? `${strengthPercent}%` : "N/A")}
            </span>` : ""}
            ${renderUpsetBadge(team, strengthPercent)}
          </div>
        `;
        }).join("")}
      </div>
    `;
  }

  return `
    <div class="stats-matchup-list">
      ${teams.map((team, index) => {
        const strengthPercent = teamStrengths[index];
        const vsLabel = showVersus && index < teams.length - 1 ? `<span class="stats-versus">vs</span>` : "";
        return `
          <div class="stats-matchup-team-row">
            <span class="stats-team ${getTeamToneClass(getNormalizedTeamUserType(game, team))}">
              ${team.players
                .map((player) => `<span class="stats-team-player">${renderPlayerLabel(player)}</span>`)
                .join("")}
            </span>
            ${renderUpsetBadge(team, strengthPercent)}
            ${showTeamStrength ? `<span class="stats-team-strength ${getTeamStrengthToneClass(strengthPercent, teamStrengths)}">
              Team power: ${escapeHtml(Number.isFinite(strengthPercent) ? `${strengthPercent}%` : "N/A")}
            </span>` : ""}
          </div>
          ${vsLabel}
        `;
      }).join("")}
    </div>
  `;
}

function getLastUpdateTime(results) {
  if (leaderboardData?.generatedAt) {
    return new Date(leaderboardData.generatedAt).getTime();
  }
  if (liveFeedState === "live") {
    return getLatestEndDate(results) || getMirrorSyncTime();
  }

  return getMirrorSyncTime() || getLatestEndDate(results);
}

function renderStatusText() {
  if (!statusElement) {
    return;
  }

  const mirrorStale = isMirrorStale();
  statusElement.classList.toggle("is-stale", mirrorStale);

  if (!lastStatsUpdateAt) {
    statusElement.innerHTML = `
      <span class="stats-card-label">Last Updated</span>
      <strong class="stats-card-value stats-update-value">Unavailable</strong>
    `;
    statusElement.removeAttribute("title");
    return;
  }

  const absoluteLabel = `Last update: ${formatDate(lastStatsUpdateAt)}`;
  const relativeLabel = formatRelativeTime(lastStatsUpdateAt);
  const updateLabel = document.createElement("span");
  updateLabel.className = "stats-card-label";
  updateLabel.textContent = "Last Updated";

  const updateLine = document.createElement("strong");
  updateLine.className = "stats-card-value stats-update-value";
  updateLine.textContent = relativeLabel.replace(/^Updated\s+/i, "");

  statusElement.replaceChildren(updateLabel, updateLine);
  statusElement.title = `${absoluteLabel} (${relativeLabel})`;
}

function updateStatusText(results) {
  if (!statusElement) {
    return;
  }

  lastStatsUpdateAt = getLastUpdateTime(results);
  renderStatusText();

  if (!statusRefreshTimer) {
    statusRefreshTimer = window.setInterval(renderStatusText, 60_000);
  }
}

function renderTrendingPlayers(accountList, gameList = []) {
  if (!summaryElement) {
    return;
  }

  let trendingElement = document.getElementById("statsTrendingPlayers");
  if (!trendingElement) {
    trendingElement = document.createElement("section");
    trendingElement.id = "statsTrendingPlayers";
    trendingElement.className = "stats-trending-players";
    summaryElement.insertAdjacentElement("afterend", trendingElement);
  }

  const leaderboardRankedPlayers = accountList.filter((account) => !account.discounted);
  const topEloAccount = leaderboardRankedPlayers[0] || accountList[0] || null;
  const topKillsAccount = leaderboardRankedPlayers
    .filter((account) => account.totalKills > 0)
    .sort((left, right) => right.totalKills - left.totalKills || right.elo - left.elo)[0] || null;
  const rankedPlayers = filterRecentlyActiveAccounts(accountList, gameList)
    .filter((account) => !account.discounted);
  if (!leaderboardRankedPlayers.length) {
    trendingElement.hidden = true;
    trendingElement.innerHTML = "";
    return;
  }

  const trends = rankedPlayers.map((account) => ({
    account,
    trend: getRecentPlayerTrend(account)
  }));
  const recentTrends = trends.filter((entry) => entry.trend.games >= 10);
  const pickLeader = (entries, key) => [...entries]
    .sort((left, right) => (
      right.trend[key] - left.trend[key]
      || right.account.elo - left.account.elo
      || String(left.account.name || "").localeCompare(String(right.account.name || ""))
    ))[0] || null;
  const eloLeader = pickLeader(recentTrends, "eloGain");
  const streakLeader = pickLeader(trends, "streak");
  const winRateLeader = pickLeader(recentTrends, "winRate");
  const upsetLeader = pickLeader(trends, "upsetWins");

  const renderTrendingCard = (label, entry, value, detail) => {
    if (!entry) {
      return `
        <article class="stats-trending-card">
          <span>${escapeHtml(label)}</span>
          <strong>--</strong>
          <small>Not enough match history</small>
        </article>
      `;
    }
    const profileUrl = new URL("index.html", window.location.href);
    const params = new URLSearchParams({
      playerSearch: entry.account.name || "",
      player: getAccountExpandKey(entry.account)
    });
    if (selectedLeaderboard !== "Global") {
      params.set("leaderboard", selectedLeaderboard);
    }
    profileUrl.search = params.toString();
    return `
      <article class="stats-trending-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <a href="${escapeHtml(profileUrl.href)}" target="_parent" aria-label="Open ${escapeHtml(entry.account.name || "Unknown player")} profile">${escapeHtml(entry.account.name || "Unknown player")}</a>
        <small>${escapeHtml(detail)}</small>
      </article>
    `;
  };

  trendingElement.hidden = false;
  trendingElement.innerHTML = `
    <div class="stats-trending-grid">
      ${renderTrendingCard(
        "Top ELO",
        topEloAccount ? { account: topEloAccount } : null,
        topEloAccount ? topEloAccount.elo.toFixed(2) : "--",
        "Highest rating in this leaderboard"
      )}
      ${renderTrendingCard(
        "Total kills",
        topKillsAccount ? { account: topKillsAccount } : null,
        topKillsAccount ? `${topKillsAccount.totalKills.toLocaleString()} kills` : "--",
        "Unit kills + structures destroyed"
      )}
      ${renderTrendingCard(
        "Biggest ELO gain",
        eloLeader,
        eloLeader ? `${eloLeader.trend.eloGain >= 0 ? "+" : ""}${eloLeader.trend.eloGain.toFixed(2)}` : "--",
        "Across the latest 10 matches"
      )}
      ${renderTrendingCard(
        "Longest current streak",
        streakLeader,
        streakLeader ? `${streakLeader.trend.streak} ${streakLeader.trend.streak === 1 ? "win" : "wins"}` : "--",
        "Consecutive wins through the latest match"
      )}
      ${renderTrendingCard(
        "Best recent win rate",
        winRateLeader,
        winRateLeader ? `${winRateLeader.trend.winRate.toFixed(0)}%` : "--",
        winRateLeader ? `${winRateLeader.trend.wins} wins in the latest 10 matches` : "Not enough match history"
      )}
      ${renderTrendingCard(
        "Most upset victories",
        upsetLeader,
        upsetLeader ? `${upsetLeader.trend.upsetWins} ${upsetLeader.trend.upsetWins === 1 ? "win" : "wins"}` : "--",
        "Lower-powered team victories"
      )}
    </div>
  `;
}

function renderSummary(accountList, gameList) {
  if (!summaryElement) {
    return;
  }

  if (!accountList.length || !gameList.length) {
    renderTrendingPlayers([], []);
    summaryElement.innerHTML = `
      <article class="stats-card">
        <span class="stats-card-label">Stats</span>
        <strong class="stats-card-value">Unavailable</strong>
      </article>
    `;
    return;
  }

  const rankedPlayers = accountList.filter((account) => !account.discounted);
  const latestMatch = gameList[0];
  const latestReplayUrl = latestMatch?.replayUrl ? normalizeReplayUrl(latestMatch.replayUrl) : "";

  summaryElement.innerHTML = `
    <article class="stats-card">
      <span class="stats-card-label">Matches</span>
      <strong class="stats-card-value">${gameList.length}</strong>
    </article>
    <article class="stats-card">
      <span class="stats-card-label">Ranked Players</span>
      <strong class="stats-card-value">${rankedPlayers.length}</strong>
    </article>
    <article class="stats-card">
      <span class="stats-card-label">Latest Match</span>
      <strong class="stats-card-value">${latestMatch ? formatShortDate(latestMatch.endDate) : "--"}</strong>
      ${latestReplayUrl
        ? `<a class="stats-player-note stats-replay-link" href="${escapeHtml(latestReplayUrl)}" data-replay-analyzer-url="${escapeHtml(latestReplayUrl)}" aria-label="Analyze latest match on ${escapeHtml(latestMatch.mapName || "Unknown map")}">${escapeHtml(latestMatch.mapName || "Unknown map")}</a>`
        : `<span class="stats-player-note">${escapeHtml(latestMatch ? latestMatch.mapName : "Unknown map")}</span>`}
    </article>
  `;
  if (statusElement) {
    statusElement.classList.add("stats-card", "stats-update-card");
    summaryElement.append(statusElement);
    renderStatusText();
  }
  renderTrendingPlayers(accountList, gameList);
}

function renderRanks(accountList) {
  if (!ranksElement) {
    return [];
  }

  const eligibleAccounts = filterVisibleAccounts(accountList);
  const searchQuery = normalizeSearchQuery(playerSearchQuery);
  const matchingRows = eligibleAccounts
    .map((account, index) => ({ account, rank: index + 1 }))
    .filter(({ account }) => matchesPlayerSearch(account, searchQuery))
    .sort(compareRankRows);
  const rows = searchQuery ? matchingRows : matchingRows.slice(0, visiblePlayerCount);

  if (!rows.length) {
    ranksElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">${searchQuery ? "No players matched that nickname or key." : "No ranked players found for this slice."}</td>
      </tr>
    `;
    renderRankActions(eligibleAccounts.length, 0, searchQuery);
    return [];
  }

  ranksElement.innerHTML = rows
    .map(({ account, rank }) => {
      const displayStats = getAccountDisplayStats(account);
      const displayGameCount = getAccountDisplayGameCount(account);
      const eloLabel = account.discounted ? "--" : account.elo.toFixed(2);
      const recentTrend = getRecentPlayerTrend(account);
      const eloChangeLabel = `${recentTrend.eloGain > 0 ? "+" : ""}${recentTrend.eloGain.toFixed(2)}`;
      const eloChangeClass = recentTrend.eloGain > 0
        ? "is-positive"
        : recentTrend.eloGain < 0
          ? "is-negative"
          : "is-neutral";
      const streakLabel = recentTrend.streak > 0 ? `🔥 ${recentTrend.streak}W` : "0W";
      const formLabel = `${eloChangeLabel} ELO over the latest ${recentTrend.games} matches; current win streak ${recentTrend.streak}`;
      const publicKeys = [...account.publicKeys].sort();
      const accountNames = getSortedAccountNames(account);
      const keyCountLabel = `${publicKeys.length} key(s) tracked`;
      const playerLine = escapeHtml(account.name || "Unknown");
      const botBadge = Boolean(account.bot) === true
        ? '<span class="stats-player-bot">bot</span>'
        : "";
      const hasDetails = Boolean(publicKeys.length || accountNames.length > 1);
      const expandKey = getAccountExpandKey(account);
      const isExpanded = expandedAccounts.has(expandKey);
      const expandLabel = isExpanded
        ? "Close player profile"
        : accountNames.length > 1
          ? "Open profile, player names, and keys"
          : "Open player profile";
      const nameDetails = accountNames.length > 1
        ? `
            <div class="stats-detail-group">
              <span class="stats-detail-label">Player names</span>
              <div class="stats-name-list">
                ${accountNames
                  .map(([name, count]) => `
                    <button
                      class="stats-name-chip stats-copy-chip${name === account.name ? " is-primary" : ""}"
                      type="button"
                      data-copy-value="${escapeHtml(name)}"
                      data-copy-default="Click to copy"
                      aria-label="Copy alias ${escapeHtml(name)}"
                    >
                      <span class="stats-name-copy">
                        <span class="stats-name-text">${escapeHtml(name)}</span>
                        <sup class="stats-name-count">${count}</sup>
                      </span>
                      <span class="stats-copy-hint" aria-hidden="true">Click to copy</span>
                    </button>
                  `)
                  .join("")}
              </div>
            </div>
          `
        : "";
      const keyDetails = publicKeys.length
        ? `
            <div class="stats-detail-group">
              <span class="stats-detail-label">${escapeHtml(keyCountLabel)}</span>
              <div class="stats-key-list">
                ${publicKeys
                  .map((publicKey) => `
                    <button
                      class="stats-key-item stats-copy-chip"
                      type="button"
                      data-copy-value="${escapeHtml(publicKey)}"
                      data-copy-default="Click to copy"
                      aria-label="Copy public key"
                    >
                      <code class="stats-key-value">${escapeHtml(publicKey)}</code>
                      <span class="stats-copy-hint" aria-hidden="true">Click to copy</span>
                    </button>
                  `)
                  .join("")}
              </div>
            </div>
          `
        : "";
      const playerDetails = `
        <div class="stats-player-line">
          <span class="stats-player-label">${playerLine}</span>
          ${botBadge}
          <button
            class="stats-expand-toggle"
            type="button"
            data-expand-account="${escapeHtml(expandKey)}"
            aria-expanded="${isExpanded ? "true" : "false"}"
          >
            <span aria-hidden="true">${isExpanded ? "-" : "+"}</span>
            <span class="visually-hidden">${escapeHtml(expandLabel)}</span>
          </button>
        </div>
      `;
      const detailRow = hasDetails && isExpanded
        ? `
            <tr class="stats-detail-row">
              <td colspan="5">
                <div class="stats-detail-panel">
                  <div class="stats-key-panel">
                    ${nameDetails}
                    ${keyDetails}
                  </div>
                </div>
              </td>
            </tr>
          `
        : "";
      return `
        <tr class="stats-rank-row${isExpanded ? " is-expanded" : ""} is-clickable" data-expand-account="${escapeHtml(expandKey)}">
          <td class="stats-rank">${rank}</td>
          <td class="stats-player-name">
            ${playerDetails}
          </td>
          <td class="stats-elo">
            <span class="stats-elo-value">${eloLabel}</span>
            <span class="stats-form-indicators" aria-label="${escapeHtml(formLabel)}" title="${escapeHtml(formLabel)}">
              <span class="stats-form-change ${eloChangeClass}">${eloChangeLabel}</span>
              <span class="stats-form-streak${recentTrend.streak > 0 ? " is-active" : ""}">${streakLabel}</span>
            </span>
          </td>
          <td>${account.games.length}</td>
          <td class="stats-record">
            <span class="stats-record-grid">
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.wins}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.wins, displayGameCount)}</span>
              </span>
              <span class="stats-record-sort-divider">/</span>
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.losses}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.losses, displayGameCount)}</span>
              </span>
              <span class="stats-record-sort-divider">/</span>
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.draws}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.draws, displayGameCount)}</span>
              </span>
              <span class="stats-record-sort-divider">/</span>
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.crashes}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.crashes, displayGameCount)}</span>
              </span>
            </span>
          </td>
        </tr>
        ${detailRow}
      `;
    })
    .join("");

  function scrollExpandedAccountToTop(expandAccount) {
    requestAnimationFrame(() => {
      const scrollContainer = ranksElement.closest(".stats-table-wrap-ranks");
      const selectedRow = [...ranksElement.querySelectorAll(".stats-rank-row[data-expand-account]")]
        .find((row) => row.dataset.expandAccount === expandAccount);
      if (!scrollContainer || !selectedRow) {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const selectedRect = selectedRow.getBoundingClientRect();
      const headerHeight = scrollContainer.querySelector("thead")?.getBoundingClientRect().height || 0;
      const selectedTop = scrollContainer.scrollTop + selectedRect.top - containerRect.top;
      scrollContainer.scrollTo({
        top: Math.max(0, selectedTop - headerHeight),
        behavior: "smooth"
      });

      const statsSection = ranksElement.closest(".landing-stats");
      if (window !== window.parent) {
        window.parent.postMessage(
          { type: "boha:scroll-content-top" },
          window.location.origin
        );
      } else if (statsSection) {
        window.scrollTo({
          top: statsSection.getBoundingClientRect().top + window.scrollY,
          behavior: "smooth"
        });
      }
    });
  }

  function toggleExpandedAccount(expandAccount) {
    if (!expandAccount) {
      return;
    }

    const isOpening = !expandedAccounts.has(expandAccount);
    if (expandedAccounts.has(expandAccount)) {
      expandedAccounts.delete(expandAccount);
      activeExpandedAccountKey = null;
      resetPlayerGamesView();
    } else {
      expandedAccounts = new Set([expandAccount]);
      activeExpandedAccountKey = expandAccount;
      resetPlayerGamesView();
    }

    render();
    if (isOpening) {
      scrollExpandedAccountToTop(expandAccount);
    }
  }

  ranksElement.querySelectorAll(".stats-rank-row[data-expand-account]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }

      const { expandAccount } = row.dataset;
      if (!expandAccount) {
        return;
      }

      toggleExpandedAccount(expandAccount);
    });
  });

  bindCopyButtons(ranksElement);

  renderRankActions(eligibleAccounts.length, matchingRows.length, searchQuery);
  return rows.map(({ account }) => account);
}

function renderRankActions(totalPlayers, matchingPlayers = totalPlayers, searchQuery = "") {
  if (!rankActionsElement) {
    return;
  }

  if (!totalPlayers && !searchQuery) {
    rankActionsElement.innerHTML = "";
    return;
  }

  if (searchQuery) {
    const matchLabel = matchingPlayers === 1 ? "player" : "players";
    rankActionsElement.innerHTML = `
      <span class="stats-panel-note">Found ${matchingPlayers} ${matchLabel} for "${escapeHtml(playerSearchQuery.trim())}".</span>
    `;
    return;
  }

  const shownCount = Math.min(visiblePlayerCount, totalPlayers);
  const canLoadMore = shownCount < totalPlayers;
  const canShowLess = shownCount > INITIAL_PLAYER_LIMIT;
  const nextLimit = canLoadMore ? getNextPlayerLimit(shownCount, totalPlayers) : shownCount;
  const actionLabel = shownCount < PLAYER_LIMIT_STEP ? "Show more" : "Load more";
  const targetLabel = nextLimit >= totalPlayers ? `all ${totalPlayers}` : `top ${nextLimit}`;

  rankActionsElement.innerHTML = `
    <span class="stats-panel-note">${canLoadMore ? `Showing top ${shownCount} of ${totalPlayers} listed players.` : `Showing all ${totalPlayers} listed players.`}</span>
    ${canShowLess ? '<button class="stats-load-more" id="statsShowLess" type="button">Show less</button>' : ""}
    ${canLoadMore ? `<button class="stats-load-more" id="statsLoadMore" type="button">${actionLabel} (${targetLabel})</button>` : ""}
  `;

  const showLessButton = rankActionsElement.querySelector("#statsShowLess");
  if (showLessButton) {
    showLessButton.addEventListener("click", () => {
      visiblePlayerCount = INITIAL_PLAYER_LIMIT;
      render();
      ranksElement.closest(".stats-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const loadMoreButton = rankActionsElement.querySelector("#statsLoadMore");
  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", () => {
      visiblePlayerCount = nextLimit;
      render();
    });
  }
}

function renderMatches(gameList) {
  if (!matchesElement) {
    return;
  }

  renderMatchMapOptions(gameList);
  const activeFilterCount = getActiveMatchFilterCount();
  if (matchFilterCountElement) {
    matchFilterCountElement.textContent = activeFilterCount
      ? `${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`
      : "No advanced filters";
  }

  const searchQuery = normalizeSearchQuery(matchesSearchQuery);
  const filteredGames = gameList
    .filter((game) => matchesRecentGameSearch(game, searchQuery))
    .filter(matchesAdvancedFilters)
    .sort(compareMatches);
  const rows = filteredGames.slice(0, visibleMatchCount);

  renderMapSummary(filteredGames);
  renderMatchActions(filteredGames.length, rows.length);

  if (!rows.length) {
    matchesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="6">${searchQuery || activeFilterCount ? "No matches matched the current filters." : "No matches found for this slice."}</td>
      </tr>
    `;
    return;
  }

  matchesElement.innerHTML = rows
    .map((game) => {
      return `
        <tr>
          <td class="stats-date">
            ${escapeHtml(formatMatchDate(game.endDate))}
            <span class="stats-date-time">${escapeHtml(formatMatchTime(game.endDate))}</span>
          </td>
          <td>
            ${renderMapFilterLink(game.mapName)}
            ${game.mods ? `<span class="stats-note">${escapeHtml(game.mods)}</span>` : ""}
          </td>
          <td class="stats-matchup">${renderMatchup(game, {
            includePlayerPower: true,
            linkToLeaderboard: true,
            showTeamStrength: true,
            showVersus: false
          })}</td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td><span class="stats-note">${escapeHtml(game.sourceLabel || "Legacy")}</span></td>
          <td><a class="stats-replay-link" href="${escapeHtml(normalizeReplayUrl(game.replayUrl))}" data-replay-analyzer-url="${escapeHtml(normalizeReplayUrl(game.replayUrl))}">Analyze</a></td>
        </tr>
      `;
    })
    .join("");
}

function getSuccessfulMapPlayers(gameList) {
  const playerRecords = new Map();
  gameList.forEach((game) => {
    const seenAccounts = new Set();
    (game.teams || []).forEach((team) => {
      const won = getNormalizedTeamUserType(game, team) === "winner";
      (team.players || []).forEach((slot) => {
        const account = slot.account;
        if (!account) {
          return;
        }
        const key = getAccountExpandKey(account);
        if (seenAccounts.has(key)) {
          return;
        }
        seenAccounts.add(key);
        const record = playerRecords.get(key) || {
          name: account.name || "Unknown",
          games: 0,
          wins: 0
        };
        record.games += 1;
        record.wins += won ? 1 : 0;
        playerRecords.set(key, record);
      });
    });
  });

  return [...playerRecords.values()]
    .sort((left, right) => (
      right.wins - left.wins
      || (right.wins / right.games) - (left.wins / left.games)
      || right.games - left.games
      || left.name.localeCompare(right.name)
    ))
    .slice(0, 3);
}

function renderMapSummary(gameList) {
  const tableWrap = matchesElement?.closest(".stats-table-wrap-matches");
  if (!tableWrap) {
    return;
  }

  let summary = document.getElementById("statsMapSummary");
  if (!summary) {
    summary = document.createElement("section");
    summary.id = "statsMapSummary";
    summary.className = "stats-map-summary";
    tableWrap.insertAdjacentElement("beforebegin", summary);
  }

  if (!matchesMap) {
    summary.hidden = true;
    summary.innerHTML = "";
    return;
  }

  const averageDuration = gameList.length
    ? gameList.reduce((total, game) => total + Number(game.duration || 0), 0) / gameList.length
    : 0;
  const successfulPlayers = getSuccessfulMapPlayers(gameList);
  summary.hidden = false;
  summary.innerHTML = `
    <div class="stats-map-summary-title">
      <span>Map summary</span>
      <strong>${escapeHtml(matchesMap)}</strong>
    </div>
    <div class="stats-map-summary-metric">
      <span>Matches</span>
      <strong>${gameList.length}</strong>
    </div>
    <div class="stats-map-summary-metric">
      <span>Average duration</span>
      <strong>${gameList.length ? escapeHtml(formatDuration(averageDuration)) : "--"}</strong>
    </div>
    <div class="stats-map-summary-players">
      <span>Most successful players</span>
      <div>${successfulPlayers.length
        ? successfulPlayers.map((player) => `<strong>${escapeHtml(player.name)} <small>${player.wins} ${player.wins === 1 ? "win" : "wins"} · ${Math.round((player.wins / player.games) * 100)}%</small></strong>`).join("")
        : '<small class="stats-profile-empty">No player results</small>'}</div>
    </div>
  `;
}

function renderMatchMapOptions(gameList) {
  if (!matchesMapElement) {
    return;
  }

  const mapNames = [...new Set(gameList.map((game) => game.mapName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  if (matchesMap && !mapNames.includes(matchesMap)) {
    mapNames.unshift(matchesMap);
  }
  const signature = mapNames.join("\u0000");
  if (signature === matchMapOptionsSignature && matchesMapElement.value === matchesMap) {
    return;
  }

  matchMapOptionsSignature = signature;
  matchesMapElement.innerHTML = `
    <option value="">All maps</option>
    ${mapNames.map((mapName) => `<option value="${escapeHtml(mapName)}">${escapeHtml(mapName)}</option>`).join("")}
  `;
  matchesMapElement.value = matchesMap;
}

function renderMatchActions(totalMatches, shownMatches) {
  if (!matchesActionsElement) {
    return;
  }

  matchesActionsElement.innerHTML = `
    <span class="stats-panel-note">Showing ${shownMatches} of ${totalMatches} matches.</span>
    ${shownMatches < totalMatches ? '<button class="stats-load-more" id="statsMatchesLoadMore" type="button">Load more</button>' : ""}
  `;

  const loadMoreButton = matchesActionsElement.querySelector("#statsMatchesLoadMore");
  if (!loadMoreButton) {
    return;
  }

  loadMoreButton.addEventListener("click", () => {
    visibleMatchCount = Math.min(visibleMatchCount + MATCH_LIMIT_STEP, totalMatches);
    render();
  });
}

function render() {
  if (!leaderboardData) {
    updateStatusText([]);
    updateSortIndicators();
    syncStateToUrl();
    return;
  }

  if (!leaderboardData.games.length) {
    updateStatusText([]);
    leaderboardGameCounts = new Map();
    globalRankMap = new Map();
    renderButtons();
    renderSummary([], []);
    renderPlayerComparison([]);
    renderPlayerGames(renderRanks([]));
    renderMatches([]);
    updateSortIndicators();
    syncStateToUrl();
    return;
  }

  const { accounts: globalAccounts, games: globalGames } = hydratePublishedBoard("Global");

  const allGames = [...globalGames];
  const globalAccountList = sortAccounts(globalAccounts.values());
  resolveActivePlayerShareKey(globalAccountList);
  globalRankMap = buildGlobalRankMap(globalAccountList);

  leaderboardGameCounts = new Map(Object.entries(leaderboardData.leaderboards)
    .map(([leaderboard, board]) => [leaderboard, Number(board.matches || 0)]));

  const { accounts, games } = hydratePublishedBoard(selectedLeaderboard);

  const accountList = sortAccounts(accounts.values());
  const gameList = [...games].sort((left, right) => right.endDate - left.endDate);
  const recentGameList = gameList;

  updateStatusText(leaderboardData.games);
  renderButtons();
  renderSummary(accountList, gameList);
  renderRanks(accountList);
  renderPlayerComparison(accountList);
  renderPlayerGames(accountList, globalAccountList);
  renderMatches(recentGameList);
  updateSortIndicators();
  syncStateToUrl();
}

function updateActiveButtons() {
  if (!buttonsElement) {
    return;
  }

  buttonsElement.closest(".stats-leaderboard-filter-menu")
    ?.classList.toggle("has-active-filter", selectedLeaderboard !== "Global");
  buttonsElement.querySelectorAll(".stats-filter-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.leaderboard === selectedLeaderboard);
  });
}

function getLeaderboardGameCount(leaderboard) {
  return leaderboardGameCounts.get(leaderboard) || 0;
}

function getOrderedLeaderboards() {
  const availableLeaderboards = runtime.leaderboards?.length ? runtime.leaderboards : ["Global"];

  return [...availableLeaderboards]
    .filter((leaderboard) => !HIDDEN_LEADERBOARDS.has(leaderboard))
    .sort((left, right) => {
    const countDelta = getLeaderboardGameCount(right) - getLeaderboardGameCount(left);
    if (countDelta !== 0) {
      return countDelta;
    }

    if (left === "Global") {
      return -1;
    }
    if (right === "Global") {
      return 1;
    }

      return left.localeCompare(right);
    });
}

function renderButtons() {
  if (!buttonsElement) {
    return;
  }

  buttonsElement.innerHTML = "";
  const orderedLeaderboards = getOrderedLeaderboards();
  orderedLeaderboards.forEach((leaderboard) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-filter-button";
    button.dataset.leaderboard = leaderboard;
    button.textContent = leaderboard;
    button.addEventListener("click", () => {
      if (selectedLeaderboard !== leaderboard) {
        visiblePlayerCount = INITIAL_PLAYER_LIMIT;
        visibleMatchCount = INITIAL_MATCH_LIMIT;
        resetPlayerGamesView();
      }
      selectedLeaderboard = leaderboard;
      updateActiveButtons();
      render();
    });
    buttonsElement.appendChild(button);
  });

  updateActiveButtons();
}

if (playerSearchElement) {
  playerSearchElement.addEventListener("input", (event) => {
    playerSearchQuery = event.currentTarget.value;
    render();
  });
}

if (matchesSearchElement) {
  matchesSearchElement.addEventListener("input", (event) => {
    matchesSearchQuery = event.currentTarget.value;
    visibleMatchCount = INITIAL_MATCH_LIMIT;
    render();
  });
}

function bindMatchFilter(element, eventName, updateValue) {
  element?.addEventListener(eventName, (event) => {
    updateValue(event.currentTarget);
    visibleMatchCount = INITIAL_MATCH_LIMIT;
    render();
  });
}

bindMatchFilter(matchesDateFromElement, "change", (element) => { matchesDateFrom = element.value; });
bindMatchFilter(matchesDateToElement, "change", (element) => { matchesDateTo = element.value; });
bindMatchFilter(matchesMapElement, "change", (element) => { matchesMap = element.value; });
bindMatchFilter(matchesMinDurationElement, "input", (element) => { matchesMinDuration = element.value; });
bindMatchFilter(matchesMaxDurationElement, "input", (element) => { matchesMaxDuration = element.value; });
bindMatchFilter(matchesMinPlayersElement, "input", (element) => { matchesMinPlayers = element.value; });
bindMatchFilter(matchesMaxPlayersElement, "input", (element) => { matchesMaxPlayers = element.value; });
bindMatchFilter(matchesMinPowerGapElement, "input", (element) => { matchesMinPowerGap = element.value; });
bindMatchFilter(matchesUpsetsOnlyElement, "change", (element) => { matchesUpsetsOnly = element.checked; });

window.addEventListener("popstate", () => {
  applyStateFromUrl();
  render();
});

function closeLiveFeed() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function startLiveSync() {
  if (window.location.protocol === "file:" || USE_REMOTE_MIRROR_JSON) {
    liveFeedState = "unavailable";
    render();
    return;
  }

  closeLiveFeed();

  const latestEndDate = getLatestEndDate(resultsData.results);
  const feedUrl = new URL(LIVE_RESULTS_URL);
  feedUrl.search = `?id=${encodeURIComponent(`${resultsData.format} ${resultsData.results.length} ${latestEndDate}`)}`;

  let sawSignal = false;
  eventSource = new EventSource(feedUrl);

  eventSource.addEventListener("reset", (event) => {
    sawSignal = true;
    resultsData.format = Number(event.data);
    resultsData.results = [];
  });

  eventSource.onmessage = (event) => {
    try {
      sawSignal = true;
      resultsData.results.push(JSON.parse(event.data));
    } catch (error) {
      console.warn("Unable to parse live results event.", error);
    }
  };

  eventSource.addEventListener("synced", () => {
    sawSignal = true;
    liveFeedState = "live";
    render();
  });

  eventSource.onerror = () => {
    if (!sawSignal) {
      liveFeedState = "unavailable";
      closeLiveFeed();
      render();
    }
  };
}

async function refreshFromMirror(force = false) {
  const leaderboardChanged = await ensureLeaderboardData(force);

  if (leaderboardChanged || force) {
    render();
  }
}

function startRefreshLoop() {
  if (!refreshTimer) {
    refreshTimer = window.setInterval(() => {
      refreshFromMirror(false).catch((error) => {
        console.warn("Automatic upstream refresh failed.", error);
      });
    }, AUTO_REFRESH_MS);
  }

  if (!visibilityListenerAttached) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshFromMirror(false).catch((error) => {
          console.warn("Foreground refresh failed.", error);
        });
      }
    });
    visibilityListenerAttached = true;
  }
}

window.addEventListener("beforeunload", () => {
  closeLiveFeed();
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
  if (statusRefreshTimer) {
    window.clearInterval(statusRefreshTimer);
  }
});

document.addEventListener("click", (event) => {
  const replayLink = event.target.closest(".stats-replay-link[data-replay-analyzer-url]");
  if (!replayLink || window.parent === window) {
    return;
  }

  event.preventDefault();
  window.parent.postMessage(
    {
      type: "boha:open-replay-analyzer",
      replayUrl: replayLink.dataset.replayAnalyzerUrl
    },
    window.location.origin
  );
});

async function init() {
  applyStateFromUrl();
  setupSortHeaders();

  try {
    await refreshFromMirror(true);
  } catch (error) {
    console.error(error);
    if (statusElement) {
      statusElement.textContent = "Unable to load mirrored upstream stats.";
    }
    return;
  }

  startRefreshLoop();
}

init();
