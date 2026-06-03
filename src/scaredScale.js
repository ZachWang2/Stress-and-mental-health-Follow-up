export const SCARED_ITEMS = [
  { id: 1, text: "当我感到害怕时，会出现呼吸困难。" },
  { id: 2, text: "我在学校时感到头痛。" },
  { id: 3, text: "我不喜欢与不太熟悉的人在一起。" },
  { id: 4, text: "如果我不在家里睡觉，就觉得内心不安。" },
  { id: 5, text: "我经常担心别人是不是喜欢我。" },
  { id: 6, text: "我害怕时，感到马上要死去似的。" },
  { id: 7, text: "我总是感到紧张不安。" },
  { id: 8, text: "父母无论去哪里我总是离不开他们。" },
  { id: 9, text: "别人说我好像很紧张的样子。" },
  { id: 10, text: "当我与不熟悉的人在一起时就感到紧张。" },
  { id: 11, text: "在学校时就出现肚子痛。" },
  { id: 12, text: "当我害怕时，感觉自己快要发疯、失去控制了。" },
  { id: 13, text: "我总担心自己一个人睡觉。" },
  { id: 14, text: "我担心自己不像其他孩子一样好。" },
  { id: 15, text: "当我害怕时，感到恍恍惚惚、好像周围的一切不真实似的。" },
  { id: 16, text: "我梦见父母发生了不幸的事情。" },
  { id: 17, text: "我担心又要去上学。" },
  { id: 18, text: "我害怕时，会心跳加快。" },
  { id: 19, text: "我手脚发抖打颤。" },
  { id: 20, text: "我梦见发生了对我不利的事情。" },
  { id: 21, text: "我对于一些精心为我而安排的事感到不安和不自在。" },
  { id: 22, text: "当我害怕时，我会出汗。" },
  { id: 23, text: "我是一个忧虑的人。" },
  { id: 24, text: "我无缘无故地感到害怕。" },
  { id: 25, text: "我害怕一个人待在家里。" },
  { id: 26, text: "我觉得和不熟悉的人说话很困难。" },
  { id: 27, text: "当我害怕时，会感到难以呼吸。" },
  { id: 28, text: "别人说我担心得太多了。" },
  { id: 29, text: "我不愿离开自己的家。" },
  { id: 30, text: "我担心以前那种紧张（或惊恐）的感觉再次出现。" },
  { id: 31, text: "我总担心父母会出事。" },
  { id: 32, text: "当我与不熟悉的人在一起时，会感到害羞。" },
  { id: 33, text: "我担心将来会发生什么事情。" },
  { id: 34, text: "当我害怕时，会感到恶心、想吐。" },
  { id: 35, text: "我担心自己能不能把事情做好。" },
  { id: 36, text: "我害怕去上学。" },
  { id: 37, text: "我会担心已经发生了的事情。" },
  { id: 38, text: "当我害怕时，会感到头昏。" },
  { id: 39, text: "当我与其他伙伴或大人在一起做事情时（如大声朗读、说话、游戏或体育活动），如果他们看着我，我就感到紧张。" },
  { id: 40, text: "当我去参加有很多不熟悉的人在场的活动或聚会，会感到紧张。" },
  { id: 41, text: "我是一个害羞的人。" },
];

export const SCARED_OPTIONS = [
  { value: 0, label: "没有此问题" },
  { value: 1, label: "有时有" },
  { value: 2, label: "经常有" },
];

export const SCARED_SUBSCALES = [
  { key: "panicSomatic", label: "惊恐/躯体症状", cutoff: 7, items: [1, 6, 9, 12, 15, 18, 19, 22, 24, 27, 30, 34, 38] },
  { key: "generalized", label: "广泛性焦虑", cutoff: 9, items: [5, 7, 14, 21, 23, 28, 33, 35, 37] },
  { key: "separation", label: "分离焦虑", cutoff: 5, items: [4, 8, 13, 16, 20, 25, 29, 31] },
  { key: "social", label: "社交焦虑", cutoff: 8, items: [3, 10, 26, 32, 39, 40, 41] },
  { key: "schoolAvoidance", label: "学校回避", cutoff: 3, items: [2, 11, 17, 36] },
];

export const SCARED_TOTAL_CUTOFF = 25;

export function createEmptyScaredAnswers() {
  return Object.fromEntries(SCARED_ITEMS.map((item) => [item.id, 0]));
}

export function scoreScared(answers) {
  const total = SCARED_ITEMS.reduce((sum, item) => sum + Number(answers[item.id] ?? 0), 0);
  const subscales = SCARED_SUBSCALES.map((scale) => {
    const score = scale.items.reduce((sum, id) => sum + Number(answers[id] ?? 0), 0);
    return {
      ...scale,
      score,
      elevated: score >= scale.cutoff,
    };
  });
  return {
    total,
    totalElevated: total >= SCARED_TOTAL_CUTOFF,
    subscales,
  };
}
