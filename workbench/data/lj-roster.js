/**
 * 丽江小学 · 2016 年推荐市外国语学校（报名学生名单）
 * 来源：用户提供的实拍名单表（演示用班级花名册）
 *
 * 学号策略（与班级弹窗一致）：
 *  - 本表素材含「受理回执号」→ 学号取回执号末两位 01–30（识别时写入）
 *  - 若其它名单素材无学号 → 学号字段应为空，由老师手填
 * 姓名来自「申请区抽签姓名」列。
 */
window.LJ_ROSTER = {
  id: "c_lj_2016",
  name: "丽江小学 · 市外报名名单",
  grade: "小学（推荐）",
  school: "广州市番禺区丽江小学",
  district: "北片",
  schoolCode: "53",
  unitCode: "313",
  source: "photo_roster_2016",
  note: "2016年5月 · 推荐市外国语学校报名学生名单（实拍导入）",
  students: [
    { no: "01", name: "鲁芯言", receipt: "313001", gender: "女" },
    { no: "02", name: "陈罗玥平", receipt: "313002", gender: "男" },
    { no: "03", name: "陈罗玥安", receipt: "313003", gender: "男" },
    { no: "04", name: "邓汇子", receipt: "313004", gender: "女" },
    { no: "05", name: "王翰平", receipt: "313005", gender: "男" },
    { no: "06", name: "崔越", receipt: "313006", gender: "女" },
    { no: "07", name: "罗宜彤", receipt: "313007", gender: "女" },
    { no: "08", name: "林沁", receipt: "313008", gender: "女" },
    { no: "09", name: "梁可琦", receipt: "313009", gender: "女" },
    { no: "10", name: "谢璐羽", receipt: "313010", gender: "女" },
    { no: "11", name: "邱宇阳", receipt: "313011", gender: "男" },
    { no: "12", name: "陈妍", receipt: "313012", gender: "女" },
    { no: "13", name: "鲁芯妤", receipt: "313013", gender: "女" },
    { no: "14", name: "邝曦", receipt: "313014", gender: "男" },
    { no: "15", name: "钟昊琦", receipt: "313015", gender: "女" },
    { no: "16", name: "徐翊画", receipt: "313016", gender: "女" },
    { no: "17", name: "沈拙", receipt: "313017", gender: "女" },
    { no: "18", name: "刘霁阳", receipt: "313018", gender: "男" },
    { no: "19", name: "刘俊喆", receipt: "313019", gender: "男" },
    { no: "20", name: "区楚杭", receipt: "313020", gender: "男" },
    { no: "21", name: "戴明燊", receipt: "313021", gender: "男" },
    { no: "22", name: "凌嘉俊", receipt: "313022", gender: "男" },
    { no: "23", name: "吕博君", receipt: "313023", gender: "男" },
    { no: "24", name: "陈嘉怡", receipt: "313024", gender: "女" },
    { no: "25", name: "杨雨萌", receipt: "313025", gender: "女" },
    { no: "26", name: "胡静澜", receipt: "313026", gender: "女" },
    { no: "27", name: "邓涵", receipt: "313027", gender: "女" },
    { no: "28", name: "谢文怡", receipt: "313028", gender: "女" },
    { no: "29", name: "梁筱蓝", receipt: "313029", gender: "女" },
    { no: "30", name: "梁予晴", receipt: "313030", gender: "女" },
  ],
};

/** 转成班级名单结构 */
window.LJ_ROSTER.toClassStudents = function () {
  return (window.LJ_ROSTER.students || []).map((s, i) => ({
    id: `lj_${String(i + 1).padStart(2, "0")}`,
    no: s.no,
    name: s.name,
    conf: 0.96,
    source: "photo_roster",
    gender: s.gender,
    receipt: s.receipt,
  }));
};
