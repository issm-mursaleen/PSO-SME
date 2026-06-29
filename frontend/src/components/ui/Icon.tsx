import {
  Landmark, Plus, PlusCircle, FilePlus, ShoppingCart, BarChart3, Paperclip,
  Megaphone, XCircle, MessageSquare, CheckCircle2, ChevronRight,
  X, CreditCard, Trash2, Trash, Check, CheckCheck, Download, Pencil, MessagesSquare,
  Gavel, History, Network, Image as ImageIcon, Info, LineChart, Lightbulb, KeyRound,
  BookOpen, Mic, MoreVertical, BellRing, Banknote, User, UserPlus, UserSearch,
  FileText, PieChart, Printer, Receipt, ReceiptText, AlertTriangle, Save, Clock,
  Search, Send, Share2, Bot, Store, Table as TableIcon, TrendingUp, TrendingDown,
  BadgeCheck, Video, Flame, Sun, Moon, Bell, Settings, Calendar, LayoutDashboard,
  Users, HelpCircle, Wallet, PauseCircle, MessageCircle, Smartphone,
  ShieldAlert, ChevronUp, Eye, Circle, type LucideIcon,
} from 'lucide-react';

/** Material Symbol name → lucide component. */
const MAP: Record<string, LucideIcon> = {
  account_balance: Landmark,
  add: Plus,
  add_circle: PlusCircle,
  add_notes: FilePlus,
  add_shopping_cart: ShoppingCart,
  analytics: BarChart3,
  attach_file: Paperclip,
  attachment: Paperclip,
  campaign: Megaphone,
  cancel: XCircle,
  chat: MessageSquare,
  check_circle: CheckCircle2,
  chevron_right: ChevronRight,
  close: X,
  credit_card: CreditCard,
  delete: Trash2,
  delete_outline: Trash,
  delete_sweep: Trash2,
  done: Check,
  done_all: CheckCheck,
  download: Download,
  edit: Pencil,
  forum: MessagesSquare,
  gavel: Gavel,
  group: Users,
  history: History,
  hub: Network,
  image: ImageIcon,
  info: Info,
  visibility: Eye,
  eye: Eye,
  insights: LineChart,
  lightbulb: Lightbulb,
  lock_reset: KeyRound,
  menu_book: BookOpen,
  mic: Mic,
  more_vert: MoreVertical,
  notification_important: BellRing,
  pause_circle: PauseCircle,
  sms: MessageCircle,
  chat_bubble_outline: MessageCircle,
  phone_iphone: Smartphone,
  gpp_bad: ShieldAlert,
  keyboard_arrow_up: ChevronUp,
  notifications: Bell,
  payments: Banknote,
  person: User,
  person_add: UserPlus,
  person_search: UserSearch,
  picture_as_pdf: FileText,
  pie_chart: PieChart,
  point_of_sale: ShoppingCart,
  print: Printer,
  receipt: Receipt,
  receipt_long: ReceiptText,
  report_problem: AlertTriangle,
  save: Save,
  save_alt: Save,
  schedule: Clock,
  search: Search,
  send: Send,
  settings: Settings,
  share: Share2,
  smart_toy: Bot,
  store: Store,
  table_view: TableIcon,
  trending_up: TrendingUp,
  trending_down: TrendingDown,
  verified: BadgeCheck,
  videocam: Video,
  warning: AlertTriangle,
  whatshot: Flame,
  wallet: Wallet,
  light_mode: Sun,
  dark_mode: Moon,
  calendar_today: Calendar,
  dashboard: LayoutDashboard,
  help: HelpCircle,
  help_outline: HelpCircle,
};

interface IconProps {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Drop-in replacement for the old Material Symbols spans.
 * Colour is inherited (lucide uses currentColor), so `text-*` classes still work.
 */
export function Icon({ name, className, size = 18, strokeWidth = 2 }: IconProps) {
  const Cmp = MAP[name] ?? Circle;
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} />;
}
