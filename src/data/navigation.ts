export interface NavItem {
  label: string;
  href: string;
  emphasis?: boolean;
  variant?: 'activity'; // 色分け用（現在未使用）
  children?: NavItem[];
}

export const navigation: NavItem[] = [
  { label: '部長挨拶', href: '/greeting/' },
  { label: 'スタッフ紹介', href: '/staff/' },
  { label: '部門紹介', href: '/divisions/' },
  { label: '研究', href: '/research/', children: [
    { label: '研究紹介', href: '/research/' },
    { label: '研究業績', href: '/achievements/' },
  ]},
  { label: 'お知らせ', href: '/news/' },
  { label: '学生・見学の方へ', href: '/education/', emphasis: true, children: [
    { label: '教育・実習', href: '/education/' },
    { label: '採用・見学案内', href: '/recruit/' },
  ]},
];
