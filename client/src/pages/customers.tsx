import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Users, ShieldAlert, Edit2, Trash2,
  Phone, Mail, Globe, CheckCircle, Clock, Ban, Filter,
  ShieldCheck, UserX, Wallet, Star, Loader2, History,
  TrendingUp, TrendingDown, FileText, Upload, X, Tag,
  Eye, ScanLine, Minus, Camera, AlertCircle, UserCheck,
  ChevronRight, RefreshCw,
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import Tesseract from "tesseract.js";

// ── Yemen city / district data (all 22 governorates) ──────────────────────────

interface DistrictData { name: string; nameAr: string; subDistricts?: string[] }
interface GovernorateData { name: string; nameAr: string; districts: DistrictData[] }

const YEMEN_GOVERNORATES: GovernorateData[] = [
  { name: "أمانة العاصمة", nameAr: "أمانة العاصمة", districts: [
    { name: "أزال", nameAr: "أزال", subDistricts: ["أزال", "القاع", "السائلة"] },
    { name: "التحرير", nameAr: "التحرير", subDistricts: ["التحرير", "باب اليمن"] },
    { name: "القاهرة", nameAr: "القاهرة", subDistricts: ["القاهرة", "نقم"] },
    { name: "السبعين", nameAr: "السبعين", subDistricts: ["السبعين", "الحصبة"] },
    { name: "شعوب", nameAr: "شعوب", subDistricts: ["شعوب", "الفليحي"] },
    { name: "الوحدة", nameAr: "الوحدة" },
    { name: "معين", nameAr: "معين", subDistricts: ["معين", "الجراف"] },
    { name: "بني الحارث", nameAr: "بني الحارث", subDistricts: ["بني الحارث", "سعوان"] },
    { name: "الصافية", nameAr: "الصافية" },
    { name: "المدينة القديمة", nameAr: "المدينة القديمة" },
  ]},
  { name: "صنعاء", nameAr: "صنعاء", districts: [
    { name: "سنحان وبني بهلول", nameAr: "سنحان وبني بهلول", subDistricts: ["سنحان", "بني بهلول", "حدة"] },
    { name: "بني مطر", nameAr: "بني مطر", subDistricts: ["بني مطر", "بيت بوس", "المحابشة"] },
    { name: "خولان", nameAr: "خولان", subDistricts: ["خولان", "السدة", "بني جبر"] },
    { name: "أرحب", nameAr: "أرحب", subDistricts: ["أرحب", "بني جرموز"] },
    { name: "بني حشيش", nameAr: "بني حشيش", subDistricts: ["بني حشيش", "مسور"] },
    { name: "نهم", nameAr: "نهم", subDistricts: ["نهم", "آل عشيش"] },
    { name: "بلاد الروس", nameAr: "بلاد الروس" },
    { name: "الحيمة الخارجية", nameAr: "الحيمة الخارجية", subDistricts: ["الحيمة الخارجية", "بني غيلان"] },
    { name: "الحيمة الداخلية", nameAr: "الحيمة الداخلية" },
    { name: "مناخة", nameAr: "مناخة", subDistricts: ["مناخة", "الحجر", "بني إسماعيل"] },
    { name: "صعفان", nameAr: "صعفان" },
    { name: "همدان", nameAr: "همدان", subDistricts: ["همدان", "بيت عذران"] },
  ]},
  { name: "عدن", nameAr: "عدن", districts: [
    { name: "كريتر (صيره)", nameAr: "كريتر", subDistricts: ["كريتر", "صيره"] },
    { name: "التواهي", nameAr: "التواهي" },
    { name: "خورمكسر", nameAr: "خورمكسر" },
    { name: "المنصورة", nameAr: "المنصورة" },
    { name: "الشيخ عثمان", nameAr: "الشيخ عثمان" },
    { name: "دار سعد", nameAr: "دار سعد" },
    { name: "البريقة", nameAr: "البريقة" },
    { name: "المعلا", nameAr: "المعلا" },
  ]},
  { name: "تعز", nameAr: "تعز", districts: [
    { name: "المظفر", nameAr: "المظفر" },
    { name: "القاهرة", nameAr: "القاهرة" },
    { name: "صالة", nameAr: "صالة" },
    { name: "المعافر", nameAr: "المعافر", subDistricts: ["المعافر", "الشمايتين"] },
    { name: "الوازعية", nameAr: "الوازعية" },
    { name: "المقبانة", nameAr: "المقبانة", subDistricts: ["المقبانة", "الشريجة"] },
    { name: "موزع", nameAr: "موزع" },
    { name: "المسراخ", nameAr: "المسراخ" },
    { name: "صبر الموادم", nameAr: "صبر الموادم", subDistricts: ["صبر", "الموادم"] },
    { name: "الحوبان", nameAr: "الحوبان" },
    { name: "حيفان", nameAr: "حيفان", subDistricts: ["حيفان", "الأعبوس"] },
    { name: "شرعب الرونة", nameAr: "شرعب الرونة", subDistricts: ["شرعب الرونة", "الأعروق"] },
    { name: "شرعب السلام", nameAr: "شرعب السلام", subDistricts: ["شرعب السلام", "المواسط"] },
    { name: "جبل حبشي", nameAr: "جبل حبشي", subDistricts: ["جبل حبشي", "الأغابرة"] },
    { name: "ماوية", nameAr: "ماوية", subDistricts: ["ماوية", "الصلو"] },
    { name: "التعزية", nameAr: "التعزية", subDistricts: ["التعزية", "المعافرة"] },
    { name: "سامع", nameAr: "سامع" },
    { name: "خدير", nameAr: "خدير" },
    { name: "مشرعة وحدنان", nameAr: "مشرعة وحدنان" },
    { name: "ذوباب", nameAr: "ذوباب" },
    { name: "المخا", nameAr: "المخا" },
    { name: "الشمايتين", nameAr: "الشمايتين", subDistricts: ["الشمايتين", "النشمة"] },
    { name: "السلو", nameAr: "السلو" },
  ]},
  { name: "الحديدة", nameAr: "الحديدة", districts: [
    { name: "الحديدة", nameAr: "الحديدة" },
    { name: "الحوك", nameAr: "الحوك" },
    { name: "المغلف", nameAr: "المغلف" },
    { name: "باجل", nameAr: "باجل", subDistricts: ["باجل", "الزهرة"] },
    { name: "بيت الفقيه", nameAr: "بيت الفقيه", subDistricts: ["بيت الفقيه", "الجراحي"] },
    { name: "زبيد", nameAr: "زبيد", subDistricts: ["زبيد", "الرميمة"] },
    { name: "المراوعة", nameAr: "المراوعة" },
    { name: "الجراحي", nameAr: "الجراحي" },
    { name: "الضحي", nameAr: "الضحي" },
    { name: "الحالي", nameAr: "الحالي" },
    { name: "الزيدية", nameAr: "الزيدية" },
    { name: "اللحية", nameAr: "اللحية" },
    { name: "المنيرة", nameAr: "المنيرة" },
    { name: "حيس", nameAr: "حيس" },
    { name: "التحيتا", nameAr: "التحيتا" },
    { name: "كمران", nameAr: "كمران" },
    { name: "السخنة", nameAr: "السخنة" },
    { name: "برع", nameAr: "برع" },
    { name: "الدريهمي", nameAr: "الدريهمي" },
    { name: "الخوخة", nameAr: "الخوخة" },
    { name: "القناوص", nameAr: "القناوص" },
    { name: "المنصورية", nameAr: "المنصورية" },
  ]},
  { name: "إب", nameAr: "إب", districts: [
    { name: "النادرة", nameAr: "النادرة", subDistricts: ["النادرة", "السياني", "القفر"] },
    { name: "العدين", nameAr: "العدين", subDistricts: ["العدين", "الشعر"] },
    { name: "جبلة", nameAr: "جبلة", subDistricts: ["جبلة", "المشنة"] },
    { name: "يريم", nameAr: "يريم", subDistricts: ["يريم", "الرضمة"] },
    { name: "ذي السفال", nameAr: "ذي السفال" },
    { name: "الشعر", nameAr: "الشعر" },
    { name: "القفر", nameAr: "القفر" },
    { name: "المخادر", nameAr: "المخادر" },
    { name: "حزم العدين", nameAr: "حزم العدين" },
    { name: "بعدان", nameAr: "بعدان", subDistricts: ["بعدان", "النقيلين"] },
    { name: "السبرة", nameAr: "السبرة" },
    { name: "السياني", nameAr: "السياني" },
    { name: "السدة", nameAr: "السدة" },
    { name: "المشنة", nameAr: "المشنة" },
    { name: "الرضمة", nameAr: "الرضمة" },
    { name: "فرع العدين", nameAr: "فرع العدين" },
    { name: "المذيخرة", nameAr: "المذيخرة" },
    { name: "حبيش", nameAr: "حبيش" },
    { name: "الظهار", nameAr: "الظهار" },
    { name: "إب المدينة", nameAr: "إب المدينة" },
  ]},
  { name: "ذمار", nameAr: "ذمار", districts: [
    { name: "مدينة ذمار", nameAr: "مدينة ذمار" },
    { name: "الحداء", nameAr: "الحداء", subDistricts: ["الحداء", "بني ضبيان"] },
    { name: "جهران", nameAr: "جهران", subDistricts: ["جهران", "المنار"] },
    { name: "عتمة", nameAr: "عتمة", subDistricts: ["عتمة", "حمير"] },
    { name: "ميفعة أنس", nameAr: "ميفعة أنس" },
    { name: "وصاب العالي", nameAr: "وصاب العالي", subDistricts: ["وصاب العالي", "الأحد"] },
    { name: "وصاب السافل", nameAr: "وصاب السافل" },
    { name: "المنار", nameAr: "المنار" },
    { name: "عنس", nameAr: "عنس" },
    { name: "ضوران أنس", nameAr: "ضوران أنس" },
    { name: "جبل الشرق", nameAr: "جبل الشرق" },
    { name: "الأجبار", nameAr: "الأجبار" },
  ]},
  { name: "حضرموت", nameAr: "حضرموت", districts: [
    { name: "المكلا", nameAr: "المكلا" },
    { name: "سيئون", nameAr: "سيئون", subDistricts: ["سيئون", "القطن"] },
    { name: "شبام", nameAr: "شبام" },
    { name: "الشحر", nameAr: "الشحر" },
    { name: "تريم", nameAr: "تريم", subDistricts: ["تريم", "عينات"] },
    { name: "غيل باوزير", nameAr: "غيل باوزير" },
    { name: "القطن", nameAr: "القطن" },
    { name: "حورة", nameAr: "حورة" },
    { name: "دوعن", nameAr: "دوعن", subDistricts: ["دوعن", "هينن"] },
    { name: "العبر", nameAr: "العبر" },
    { name: "وادي العين", nameAr: "وادي العين" },
    { name: "المسيلة", nameAr: "المسيلة" },
    { name: "رماه", nameAr: "رماه" },
    { name: "الغرفة", nameAr: "الغرفة" },
    { name: "ساه", nameAr: "ساه" },
    { name: "حجر", nameAr: "حجر" },
    { name: "بروم ميفع", nameAr: "بروم ميفع" },
    { name: "ثمود", nameAr: "ثمود" },
    { name: "يبعث", nameAr: "يبعث" },
    { name: "حريضة", nameAr: "حريضة" },
    { name: "عمد", nameAr: "عمد" },
    { name: "الديس الشرقية", nameAr: "الديس الشرقية" },
    { name: "غيل بن يمين", nameAr: "غيل بن يمين" },
    { name: "الريدة وقصيعر", nameAr: "الريدة وقصيعر" },
    { name: "زمخ ومنوخ", nameAr: "زمخ ومنوخ" },
    { name: "رخية", nameAr: "رخية" },
    { name: "العقاد", nameAr: "العقاد" },
  ]},
  { name: "مأرب", nameAr: "مأرب", districts: [
    { name: "مدينة مأرب", nameAr: "مدينة مأرب" },
    { name: "صرواح", nameAr: "صرواح" },
    { name: "حريب", nameAr: "حريب" },
    { name: "مدغل", nameAr: "مدغل" },
    { name: "رغوان", nameAr: "رغوان" },
    { name: "العبدية", nameAr: "العبدية" },
    { name: "جبل مراد", nameAr: "جبل مراد" },
    { name: "محلية", nameAr: "محلية" },
    { name: "مجزر", nameAr: "مجزر" },
    { name: "رحبة", nameAr: "رحبة" },
    { name: "ماهلية", nameAr: "ماهلية" },
    { name: "حريب القراميش", nameAr: "حريب القراميش" },
    { name: "بدبدة", nameAr: "بدبدة" },
    { name: "الجوبة", nameAr: "الجوبة" },
  ]},
  { name: "حجة", nameAr: "حجة", districts: [
    { name: "حجة المدينة", nameAr: "حجة المدينة" },
    { name: "عبس", nameAr: "عبس", subDistricts: ["عبس", "الزهرة"] },
    { name: "حرض", nameAr: "حرض" },
    { name: "ميدي", nameAr: "ميدي" },
    { name: "مستبأ", nameAr: "مستبأ" },
    { name: "مبين", nameAr: "مبين" },
    { name: "الظاهر", nameAr: "الظاهر" },
    { name: "كشر", nameAr: "كشر" },
    { name: "قفل شمر", nameAr: "قفل شمر" },
    { name: "ولاعة", nameAr: "ولاعة" },
    { name: "أسلم", nameAr: "أسلم" },
    { name: "خيران المحرق", nameAr: "خيران المحرق" },
    { name: "كحلان عفار", nameAr: "كحلان عفار" },
    { name: "كحلان الشرف", nameAr: "كحلان الشرف" },
    { name: "بني القيس", nameAr: "بني القيس" },
    { name: "أفلح اليمن", nameAr: "أفلح اليمن" },
    { name: "أفلح الشام", nameAr: "أفلح الشام" },
    { name: "المحابشة", nameAr: "المحابشة" },
    { name: "الشغادرة", nameAr: "الشغادرة" },
    { name: "حيران", nameAr: "حيران" },
    { name: "نجرة", nameAr: "نجرة" },
    { name: "المفتاح", nameAr: "المفتاح" },
    { name: "شرس", nameAr: "شرس" },
    { name: "الجميمة", nameAr: "الجميمة" },
    { name: "وضرة", nameAr: "وضرة" },
    { name: "بكيل المير", nameAr: "بكيل المير" },
    { name: "القشابلة", nameAr: "القشابلة" },
    { name: "الشاهل", nameAr: "الشاهل" },
    { name: "المغربة", nameAr: "المغربة" },
    { name: "مسنان", nameAr: "مسنان" },
    { name: "العرب", nameAr: "العرب" },
  ]},
  { name: "صعدة", nameAr: "صعدة", districts: [
    { name: "صعدة المدينة", nameAr: "صعدة المدينة" },
    { name: "رازح", nameAr: "رازح" },
    { name: "باقم", nameAr: "باقم" },
    { name: "ضحيان", nameAr: "ضحيان" },
    { name: "الظاهر", nameAr: "الظاهر" },
    { name: "ساقين", nameAr: "ساقين" },
    { name: "البقع", nameAr: "البقع" },
    { name: "منبه", nameAr: "منبه" },
    { name: "قطابر", nameAr: "قطابر" },
    { name: "سحار", nameAr: "سحار" },
    { name: "مجز", nameAr: "مجز" },
    { name: "حيدان", nameAr: "حيدان" },
    { name: "الصفراء", nameAr: "الصفراء" },
    { name: "شدا", nameAr: "شدا" },
    { name: "غمر", nameAr: "غمر" },
    { name: "الحشوة", nameAr: "الحشوة" },
  ]},
  { name: "لحج", nameAr: "لحج", districts: [
    { name: "الحوطة", nameAr: "الحوطة" },
    { name: "المسيمير", nameAr: "المسيمير" },
    { name: "تبن", nameAr: "تبن" },
    { name: "ردفان", nameAr: "ردفان", subDistricts: ["ردفان", "الحبيلين"] },
    { name: "يافع", nameAr: "يافع" },
    { name: "القبيطة", nameAr: "القبيطة" },
    { name: "المقاطرة", nameAr: "المقاطرة" },
    { name: "طور الباحة", nameAr: "طور الباحة" },
    { name: "الملاح", nameAr: "الملاح" },
    { name: "المفلحي", nameAr: "المفلحي" },
    { name: "حالمين", nameAr: "حالمين" },
    { name: "يهر", nameAr: "يهر" },
    { name: "حبيل جبر", nameAr: "حبيل جبر" },
    { name: "الشعيب", nameAr: "الشعيب" },
    { name: "المضاربة", nameAr: "المضاربة" },
  ]},
  { name: "أبين", nameAr: "أبين", districts: [
    { name: "زنجبار", nameAr: "زنجبار" },
    { name: "جعار", nameAr: "جعار" },
    { name: "مودية", nameAr: "مودية" },
    { name: "لودر", nameAr: "لودر" },
    { name: "شقرة", nameAr: "شقرة" },
    { name: "خنفر", nameAr: "خنفر" },
    { name: "رصد", nameAr: "رصد" },
    { name: "المحفد", nameAr: "المحفد" },
    { name: "سرار", nameAr: "سرار" },
    { name: "أحور", nameAr: "أحور" },
    { name: "الوضيع", nameAr: "الوضيع" },
  ]},
  { name: "شبوة", nameAr: "شبوة", districts: [
    { name: "عتق", nameAr: "عتق" },
    { name: "حبان", nameAr: "حبان" },
    { name: "بيحان", nameAr: "بيحان" },
    { name: "عزان", nameAr: "عزان" },
    { name: "نصاب", nameAr: "نصاب" },
    { name: "عرمة", nameAr: "عرمة" },
    { name: "جردان", nameAr: "جردان" },
    { name: "عين", nameAr: "عين" },
    { name: "الصعيد", nameAr: "الصعيد" },
    { name: "مرخة العليا", nameAr: "مرخة العليا" },
    { name: "مرخة السفلى", nameAr: "مرخة السفلى" },
    { name: "رضوم", nameAr: "رضوم" },
    { name: "ميفعة", nameAr: "ميفعة" },
    { name: "الطلح", nameAr: "الطلح" },
    { name: "الروضة", nameAr: "الروضة" },
    { name: "حطيب", nameAr: "حطيب" },
    { name: "دهر", nameAr: "دهر" },
  ]},
  { name: "الجوف", nameAr: "الجوف", districts: [
    { name: "الحزم", nameAr: "الحزم" },
    { name: "المتون", nameAr: "المتون" },
    { name: "خب والشعف", nameAr: "خب والشعف" },
    { name: "الغيل", nameAr: "الغيل" },
    { name: "الحميدات", nameAr: "الحميدات" },
    { name: "رجوزة", nameAr: "رجوزة" },
    { name: "الظاهر", nameAr: "الظاهر" },
    { name: "بر الأنا", nameAr: "بر الأنا" },
    { name: "المصلوب", nameAr: "المصلوب" },
    { name: "خراب المراشي", nameAr: "خراب المراشي" },
    { name: "الزاهر", nameAr: "الزاهر" },
    { name: "العنان", nameAr: "العنان" },
  ]},
  { name: "الضالع", nameAr: "الضالع", districts: [
    { name: "الضالع", nameAr: "الضالع" },
    { name: "دمت", nameAr: "دمت" },
    { name: "قعطبة", nameAr: "قعطبة" },
    { name: "الأزارق", nameAr: "الأزارق" },
    { name: "الحشاء", nameAr: "الحشاء" },
    { name: "جحاف", nameAr: "جحاف" },
    { name: "جبن", nameAr: "جبن" },
    { name: "الشعيب", nameAr: "الشعيب" },
    { name: "الحصين", nameAr: "الحصين" },
  ]},
  { name: "البيضاء", nameAr: "البيضاء", districts: [
    { name: "البيضاء المدينة", nameAr: "البيضاء المدينة" },
    { name: "رداع", nameAr: "رداع", subDistricts: ["رداع", "الزاهر"] },
    { name: "السوادية", nameAr: "السوادية" },
    { name: "نعمان", nameAr: "نعمان" },
    { name: "القريشية", nameAr: "القريشية" },
    { name: "مكيراس", nameAr: "مكيراس" },
    { name: "الظاهر", nameAr: "الظاهر" },
    { name: "ولد ربيع", nameAr: "ولد ربيع" },
    { name: "الصومعة", nameAr: "الصومعة" },
    { name: "الطفة", nameAr: "الطفة" },
    { name: "ذي ناعم", nameAr: "ذي ناعم" },
    { name: "الأرياب", nameAr: "الأرياب" },
    { name: "الملاجم", nameAr: "الملاجم" },
    { name: "الشرية", nameAr: "الشرية" },
    { name: "رداع الشرقي", nameAr: "رداع الشرقي" },
    { name: "المشرع", nameAr: "المشرع" },
    { name: "سبأ", nameAr: "سبأ" },
    { name: "الكور", nameAr: "الكور" },
    { name: "العرش", nameAr: "العرش" },
    { name: "مسورة", nameAr: "مسورة" },
  ]},
  { name: "عمران", nameAr: "عمران", districts: [
    { name: "عمران المدينة", nameAr: "عمران المدينة" },
    { name: "حوث", nameAr: "حوث" },
    { name: "ريدة", nameAr: "ريدة" },
    { name: "خمر", nameAr: "خمر" },
    { name: "مسور", nameAr: "مسور" },
    { name: "شهارة", nameAr: "شهارة" },
    { name: "ثلا", nameAr: "ثلا" },
    { name: "حبور ظليمة", nameAr: "حبور ظليمة" },
    { name: "بني صريم", nameAr: "بني صريم" },
    { name: "السودة", nameAr: "السودة" },
    { name: "السود", nameAr: "السود" },
    { name: "جبل إيال يزيد", nameAr: "جبل إيال يزيد" },
    { name: "العشة", nameAr: "العشة" },
    { name: "ذيبين", nameAr: "ذيبين" },
    { name: "الأشمور", nameAr: "الأشمور" },
    { name: "خارف", nameAr: "خارف" },
    { name: "المدان", nameAr: "المدان" },
    { name: "بني جشان", nameAr: "بني جشان" },
    { name: "القفلة", nameAr: "القفلة" },
    { name: "سفيان", nameAr: "سفيان" },
  ]},
  { name: "المحويت", nameAr: "المحويت", districts: [
    { name: "المحويت المدينة", nameAr: "المحويت المدينة" },
    { name: "شبام كوكبان", nameAr: "شبام كوكبان" },
    { name: "الرجم", nameAr: "الرجم" },
    { name: "حفاش", nameAr: "حفاش" },
    { name: "ملحان", nameAr: "ملحان" },
    { name: "بني سعد", nameAr: "بني سعد" },
    { name: "الطويلة", nameAr: "الطويلة" },
    { name: "الخبت", nameAr: "الخبت" },
    { name: "الكميم", nameAr: "الكميم" },
  ]},
  { name: "ريمة", nameAr: "ريمة", districts: [
    { name: "كسمة", nameAr: "كسمة" },
    { name: "بلاد الطعام", nameAr: "بلاد الطعام" },
    { name: "مزهر", nameAr: "مزهر" },
    { name: "الجبين", nameAr: "الجبين" },
    { name: "الجعفرية", nameAr: "الجعفرية" },
    { name: "السلفية", nameAr: "السلفية" },
  ]},
  { name: "المهرة", nameAr: "المهرة", districts: [
    { name: "الغيضة", nameAr: "الغيضة" },
    { name: "حوف", nameAr: "حوف" },
    { name: "قشن", nameAr: "قشن" },
    { name: "شحن", nameAr: "شحن" },
    { name: "سيحوت", nameAr: "سيحوت" },
    { name: "حصوين", nameAr: "حصوين" },
    { name: "المسيلة", nameAr: "المسيلة" },
    { name: "منعر", nameAr: "منعر" },
    { name: "حات", nameAr: "حات" },
  ]},
  { name: "سقطرى", nameAr: "سقطرى", districts: [
    { name: "حديبو", nameAr: "حديبو" },
    { name: "قلنسية وعبد الكوري", nameAr: "قلنسية وعبد الكوري" },
  ]},
];

const LOCATIONS = [{ region: "اليمن", governorates: YEMEN_GOVERNORATES }];

const COUNTRY_CODES = [
  { code: "+967", flag: "🇾🇪", name: "Yemen" },
  { code: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "+965", flag: "🇰🇼", name: "Kuwait" },
  { code: "+974", flag: "🇶🇦", name: "Qatar" },
  { code: "+973", flag: "🇧🇭", name: "Bahrain" },
  { code: "+968", flag: "🇴🇲", name: "Oman" },
  { code: "+962", flag: "🇯🇴", name: "Jordan" },
  { code: "+20",  flag: "🇪🇬", name: "Egypt" },
  { code: "+249", flag: "🇸🇩", name: "Sudan" },
  { code: "+90",  flag: "🇹🇷", name: "Turkey" },
  { code: "+1",   flag: "🇺🇸", name: "USA" },
  { code: "+44",  flag: "🇬🇧", name: "UK" },
];

// ── PhoneInput component ──────────────────────────────────────────────────────

function PhoneInput({ value, onChange, placeholder = "7X XXX XXXX", "data-testid": testId }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  "data-testid"?: string;
}) {
  const parsePhone = (v: string) => {
    const m = COUNTRY_CODES.find(c => v.startsWith(c.code));
    return { code: m?.code ?? "+967", local: m ? v.slice(m.code.length).trimStart() : (v || "") };
  };
  const parsed = parsePhone(value);
  const [countryCode, setCountryCode] = useState(parsed.code);
  const [localNumber, setLocalNumber] = useState(parsed.local);

  useEffect(() => {
    const p = parsePhone(value);
    setCountryCode(p.code);
    setLocalNumber(p.local);
  }, [value]);

  // Sync upward when either part changes
  const propagate = (code: string, local: string) => {
    const digits = local.replace(/\D/g, "");
    onChange(`${code}${digits}`);
  };

  const handleCodeChange = (code: string) => {
    setCountryCode(code);
    propagate(code, localNumber);
  };

  const handleLocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalNumber(raw);
    propagate(countryCode, raw);
  };

  return (
    <div className="flex gap-2">
      <Select value={countryCode} onValueChange={handleCodeChange}>
        <SelectTrigger className="w-36 shrink-0 font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map(c => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-2">
                <span>{c.flag}</span>
                <span className="font-mono">{c.code}</span>
                <span className="text-muted-foreground text-xs">{c.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={localNumber}
        onChange={handleLocalChange}
        placeholder={placeholder}
        className="flex-1 font-mono"
        data-testid={testId}
        inputMode="tel"
      />
    </div>
  );
}

// ── SmartDateInput component ──────────────────────────────────────────────────
// Accepts text in YYYY-MM-DD. Auto-validates live and shows inline feedback.

function SmartDateInput({ value, onChange, placeholder = "YYYY-MM-DD", label }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [raw, setRaw] = useState(value || "");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [hint, setHint] = useState("");

  useEffect(() => { setRaw(value || ""); }, [value]);

  const validate = (v: string): { ok: boolean; iso?: string; msg?: string } => {
    if (!v) return { ok: true };
    // Accept YYYY-MM-DD or DD-MM-YYYY
    const isoRe   = /^(\d{4})-(\d{2})-(\d{2})$/;
    const dmy     = /^(\d{2})-(\d{2})-(\d{4})$/;
    let year: number, month: number, day: number;
    if (isoRe.test(v)) {
      const m = v.match(isoRe)!;
      [year, month, day] = [+m[1], +m[2], +m[3]];
    } else if (dmy.test(v)) {
      const m = v.match(dmy)!;
      [day, month, year] = [+m[1], +m[2], +m[3]];
    } else {
      return { ok: false, msg: "Use YYYY-MM-DD or DD-MM-YYYY" };
    }
    if (month < 1 || month > 12) return { ok: false, msg: "Month must be 01–12" };
    if (day < 1 || day > 31) return { ok: false, msg: "Day must be 01–31" };
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day)
      return { ok: false, msg: "Invalid date" };
    const iso = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return { ok: true, iso };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    // Auto-insert dashes
    if (/^\d{4}$/.test(v) && raw.length === 3) v = v + "-";
    if (/^\d{4}-\d{2}$/.test(v) && raw.length === 6) v = v + "-";
    setRaw(v);
    if (!v) { setStatus("idle"); setHint(""); onChange(""); return; }
    const result = validate(v);
    if (result.ok && result.iso) {
      setStatus("ok");
      setHint(format(new Date(result.iso), "d MMMM yyyy"));
      onChange(result.iso);
    } else if (!result.ok) {
      setStatus("error");
      setHint(result.msg ?? "Invalid");
      onChange(v);
    } else {
      setStatus("idle");
      setHint("");
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          value={raw}
          onChange={handleChange}
          placeholder={placeholder}
          className={
            status === "ok" ? "border-emerald-500 pr-8" :
            status === "error" ? "border-destructive pr-8" : ""
          }
          maxLength={10}
        />
        {status === "ok" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs">✓</span>
        )}
        {status === "error" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-destructive text-xs">✗</span>
        )}
      </div>
      {hint && (
        <p className={`text-xs ${status === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── YemenCityPicker component ─────────────────────────────────────────────────

function YemenCityPicker({ onChangeGovernorate, onChangeDistrict, onChangeSubDistrict, governorateValue, districtValue, subDistrictValue }: {
  governorateValue: string;
  districtValue: string;
  subDistrictValue: string;
  onChangeGovernorate: (v: string) => void;
  onChangeDistrict: (v: string) => void;
  onChangeSubDistrict: (v: string) => void;
}) {
  const allGovs = LOCATIONS.flatMap(r => r.governorates);
  const selectedGov = allGovs.find(g => g.name === governorateValue);
  const selectedDist = selectedGov?.districts.find(d => d.name === districtValue);

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">المحافظة</p>
        <Select value={governorateValue || "_none"} onValueChange={v => { onChangeGovernorate(v === "_none" ? "" : v); onChangeDistrict(""); onChangeSubDistrict(""); }}>
          <SelectTrigger data-testid="select-city">
            <SelectValue placeholder="اختر المحافظة..." />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="_none">— غير محدد —</SelectItem>
            {allGovs.map(g => (
              <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">المديرية</p>
        {selectedGov ? (
          <Select value={districtValue || "_none"} onValueChange={v => { onChangeDistrict(v === "_none" ? "" : v); onChangeSubDistrict(""); }}>
            <SelectTrigger data-testid="select-district">
              <SelectValue placeholder="اختر المديرية..." />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="_none">— غير محدد —</SelectItem>
              {selectedGov.districts.map(d => (
                <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input placeholder="المديرية" value={districtValue} onChange={e => onChangeDistrict(e.target.value)} data-testid="input-district" />
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">العزلة</p>
        {selectedDist?.subDistricts ? (
          <Select value={subDistrictValue || "_none"} onValueChange={v => onChangeSubDistrict(v === "_none" ? "" : v)}>
            <SelectTrigger data-testid="select-subdistrict">
              <SelectValue placeholder="اختر العزلة..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— غير محدد —</SelectItem>
              {selectedDist.subDistricts.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input placeholder="العزلة (اختياري)" value={subDistrictValue} onChange={e => onChangeSubDistrict(e.target.value)} data-testid="input-subdistrict" />
        )}
      </div>
    </div>
  );
}

// ── Labels multi-select ───────────────────────────────────────────────────────

function LabelMultiSelect({ selected, onChange }: {
  selected: string[];
  onChange: (labels: string[]) => void;
}) {
  const { data: availableLabels } = useQuery<{ id: string; name: string; color?: string }[]>({
    queryKey: ["/api/labels"],
  });

  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(l => l !== name));
    else onChange([...selected, name]);
  };

  if (!availableLabels?.length) return (
    <p className="text-xs text-muted-foreground">No labels defined yet. Create labels in the Labels settings.</p>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {availableLabels.map(l => {
          const isOn = selected.includes(l.name);
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => toggle(l.name)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                isOn
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
              data-testid={`label-toggle-${l.id}`}
            >
              <Tag className="w-2.5 h-2.5" />
              {l.name}
              {isOn && <X className="w-2.5 h-2.5" />}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} label{selected.length !== 1 ? "s" : ""} selected: {selected.join(", ")}
        </p>
      )}
    </div>
  );
}

// ── Types & schemas ───────────────────────────────────────────────────────────

interface Customer {
  id: string;
  customerId: string;
  firstName: string;
  secondName?: string;
  thirdName?: string;
  lastName?: string;
  fullName: string;
  email?: string;
  phonePrimary: string;
  phoneSecondary?: string[];
  whatsappGroupId?: string;
  customerStatus: "active" | "inactive" | "suspended";
  verificationStatus: "verified" | "unverified" | "blocked";
  riskLevel: "low" | "medium" | "high";
  loyaltyGroup?: string;
  referralParentId?: string;
  demographics?: { gender?: string; dob?: string; address?: string; city?: string; country?: string; nationality?: string };
  labels?: string[];
  documentation?: any[];
  notes?: string;
  isBlacklisted: boolean;
  totalTransactions: number;
  totalVolumeUsd: string;
  createdAt: string;
}

const customerFormSchema = z.object({
  firstName:          z.string().min(1, "First name is required"),
  secondName:         z.string().optional(),
  thirdName:          z.string().optional(),
  lastName:           z.string().optional(),
  fullName:           z.string().min(2, "Full name is required"),
  email:              z.string().email("Invalid email").optional().or(z.literal("")),
  phonePrimary:       z.string().min(7, "Valid phone required"),
  whatsappGroupId:    z.string().optional(),
  customerStatus:     z.enum(["active", "inactive", "suspended"]),
  verificationStatus: z.enum(["verified", "unverified", "blocked"]),
  riskLevel:          z.enum(["low", "medium", "high"]),
  loyaltyGroup:       z.string().optional(),
  notes:              z.string().optional(),
  gender:             z.string().optional(),
  dateOfBirth:        z.string().optional(),
  country:            z.string().optional(),
  city:               z.string().optional(),
  district:           z.string().optional(),
  subDistrict:        z.string().optional(),
  address:            z.string().optional(),
});

type CustomerForm = z.infer<typeof customerFormSchema>;

interface CustomerGroup { id: string; name: string; color: string; description?: string; }
interface CustomerWallet {
  id: string; customerId: string; providerName: string;
  type: "cash" | "crypto"; direction: "inflow" | "outflow";
  addressOrId: string; network?: string; label?: string;
  isDefault: boolean; createdAt: string;
}

// ── Status / risk config ──────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  active:    { label: "Active",    icon: CheckCircle, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  inactive:  { label: "Inactive",  icon: Clock,       className: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400" },
  suspended: { label: "Suspended", icon: Ban,         className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};
const verificationConfig = {
  verified:   { label: "Verified",   icon: ShieldCheck, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  unverified: { label: "Unverified", icon: Clock,       className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  blocked:    { label: "Blocked",    icon: UserX,       className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};
const riskConfig = {
  low:    { label: "Low",    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  high:   { label: "High",   className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

// ── Wallet Panel ──────────────────────────────────────────────────────────────

type ProviderOption = {
  id: string; code: string; name: string;
  providerCategory: string; fieldType: string; fieldName: string;
  currency: string | null; networkCode: string | null; isActive: boolean;
};

const walletSchema = z.object({
  providerId:   z.string().optional(),
  providerName: z.string().min(1, "Provider name required"),
  type:         z.enum(["crypto", "cash"]).default("crypto"),
  network:      z.string().optional(),
  addressOrId:  z.string().min(1, "Address / ID required"),
  label:        z.string().optional(),
  isDefault:    z.boolean().default(false),
});
type WalletForm = z.infer<typeof walletSchema>;

// ── Document types ────────────────────────────────────────────────────────────

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "national_id",       label: "National ID (Front)" },
  { value: "national_id_back",  label: "National ID (Back)" },
  { value: "passport",          label: "Passport" },
  { value: "residence_permit",  label: "Residence Permit / Iqama" },
  { value: "driver_license",    label: "Driver License" },
  { value: "trade_license",     label: "Trade License" },
  { value: "proof_of_address",  label: "Proof of Address" },
  { value: "bank_statement",    label: "Bank Statement" },
  { value: "selfie_with_id",    label: "Selfie with ID" },
  { value: "other",             label: "Other" },
];

interface DocItem {
  id: string;
  type: string;
  customLabel?: string;
  number: string;
  issueDate: string;
  expiryDate: string;
  imageData: { name: string; type: string; size: number; data: string } | null;
  storagePath?: string;
}

function providerToType(category: string): "crypto" | "cash" {
  return category.startsWith("crypto") ? "crypto" : "cash";
}

function fieldTypePlaceholder(fieldType: string): string {
  switch (fieldType) {
    case "address":     return "e.g. TRx8nK... or 0x1234...";
    case "platform_id": return "e.g. 123456789 (exchange UID)";
    case "account_id":  return "e.g. Account number";
    case "name_phone":  return "e.g. Mohammed Ali — +967771234567";
    default:            return "Enter identifier";
  }
}

const PROVIDER_CATEGORY_LABELS: Record<string, string> = {
  crypto_wallet:    "Crypto Wallets",
  crypto_platform:  "Crypto Exchanges",
  cash_bank:        "Banks",
  cash_wallet:      "Digital Wallets",
  cash_remittance:  "Remittance",
};

function CustomerWalletPanel({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: wallets, isLoading } = useQuery<CustomerWallet[]>({
    queryKey: ["/api/customers", customerId, "wallets"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/wallets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch wallets");
      return res.json();
    },
  });

  const { data: allProviders = [] } = useQuery<ProviderOption[]>({
    queryKey: ["/api/accounting/providers"],
  });
  const providers = allProviders.filter(p => p.isActive);

  const walletForm = useForm<WalletForm>({
    resolver: zodResolver(walletSchema),
    defaultValues: { providerId: "", providerName: "", type: "crypto", network: "", addressOrId: "", label: "", isDefault: false },
  });

  const watchProviderId = walletForm.watch("providerId");
  const selectedProvider = providers.find(p => p.id === watchProviderId) ?? null;

  // When provider changes, auto-fill providerName / type / network
  const handleProviderChange = (id: string) => {
    walletForm.setValue("providerId", id);
    const p = providers.find(pr => pr.id === id);
    if (p) {
      walletForm.setValue("providerName", p.name);
      walletForm.setValue("type", providerToType(p.providerCategory));
      walletForm.setValue("network", p.networkCode ?? "");
    }
    walletForm.setValue("addressOrId", "");
  };

  const resetForm = () => walletForm.reset({ providerId: "", providerName: "", type: "crypto", network: "", addressOrId: "", label: "", isDefault: false });

  const createMutation = useMutation({
    mutationFn: (data: WalletForm) => {
      return apiRequest("POST", `/api/customers/${customerId}/wallets`, {
        providerId:   data.providerId || undefined,
        providerName: data.providerName,
        type:         data.type,
        direction:    "outflow",
        network:      data.network || null,
        addressOrId:  data.addressOrId,
        label:        data.label || null,
        isDefault:    data.isDefault,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "wallets"] });
      toast({ title: "Account added" });
      setAddOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ walletId, providerName }: { walletId: string; providerName: string }) =>
      apiRequest("POST", `/api/customers/${customerId}/wallets/${walletId}/set-default`, { providerName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "wallets"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (walletId: string) => apiRequest("DELETE", `/api/customers/${customerId}/wallets/${walletId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "wallets"] });
      toast({ title: "Account removed" });
    },
  });

  // Group active providers by category
  const grouped = providers.reduce<Record<string, ProviderOption[]>>((acc, p) => {
    (acc[p.providerCategory] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Whitelisted outflow accounts — where we send payments to this customer</p>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-wallet">
          <Plus className="w-3.5 h-3.5 mr-1" />Add Account
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !wallets?.length ? (
        <div className="flex flex-col items-center py-10 text-center border border-dashed border-border rounded-xl">
          <Wallet className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No outflow accounts added yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add the customer's wallet addresses or bank account numbers for sending payments</p>
        </div>
      ) : (
        <div className="space-y-2">
          {wallets.map(w => (
            <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20" data-testid={`wallet-${w.id}`}>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{w.providerName}</span>
                  {w.label && <span className="text-xs text-muted-foreground">({w.label})</span>}
                  <Badge variant="outline" className="text-xs capitalize">{w.type}</Badge>
                  {w.network && <Badge variant="secondary" className="text-xs">{w.network}</Badge>}
                  {w.isDefault && <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"><Star className="w-2.5 h-2.5 mr-1" />Default</Badge>}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{w.addressOrId}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!w.isDefault && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDefaultMutation.mutate({ walletId: w.id, providerName: w.providerName })} title="Set as default">
                    <Star className="w-3 h-3" />
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => { if (confirm("Remove this account?")) deleteMutation.mutate(w.id); }}
                  data-testid={`button-delete-wallet-${w.id}`}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Dialog */}
      <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wallet className="w-4 h-4 text-primary" />Add Outflow Account
            </DialogTitle>
            <DialogDescription>Select the provider from your provider list, then enter the customer's account details.</DialogDescription>
          </DialogHeader>

          <Form {...walletForm}>
            <form onSubmit={walletForm.handleSubmit(d => createMutation.mutate(d))} className="space-y-3">

              <FormField control={walletForm.control} name="providerId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Provider <InfoTip text="Pick from list or enter manually below" /></FormLabel>
                  <Select
                    onValueChange={v => { field.onChange(v); handleProviderChange(v); }}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-provider">
                        <SelectValue placeholder="Select from provider list… or leave blank" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(grouped).map(([cat, provs]) => (
                        <SelectGroup key={cat}>
                          <SelectLabel>{PROVIDER_CATEGORY_LABELS[cat] ?? cat}</SelectLabel>
                          {provs.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex items-center gap-2">
                                <span>{p.name}</span>
                                {p.networkCode && <span className="text-xs text-muted-foreground">{p.networkCode}</span>}
                                {p.currency && <span className="text-xs text-muted-foreground">{p.currency}</span>}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Provider name + type + network — editable; auto-filled when provider selected */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={walletForm.control} name="providerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Binance, KuCoin, CAC Bank" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={walletForm.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="crypto">Crypto</SelectItem>
                        <SelectItem value="cash">Cash / Bank</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>

              <FormField control={walletForm.control} name="network" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Network <InfoTip text="Blockchain network or chain (e.g. BEP20, TRC20)" /></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. BEP20, TRC20, ERC20 — leave blank for banks" {...field} />
                  </FormControl>
                </FormItem>
              )} />

              <FormField control={walletForm.control} name="addressOrId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{selectedProvider ? selectedProvider.fieldName : "Wallet Address / Account ID"} *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={selectedProvider ? fieldTypePlaceholder(selectedProvider.fieldType) : "e.g. 0x1234... or account number or exchange UID"}
                      className="font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={walletForm.control} name="label" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Label <InfoTip text="Optional label to identify this wallet" /></FormLabel>
                  <FormControl><Input placeholder='e.g. "My Binance", "Main account"' {...field} /></FormControl>
                </FormItem>
              )} />

              <FormField control={walletForm.control} name="isDefault" render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0 rounded-lg border p-3">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  <div>
                    <FormLabel className="mb-0">Set as default</FormLabel>
                    <p className="text-xs text-muted-foreground">Used as the first choice for this provider</p>
                  </div>
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending} data-testid="button-save-wallet">
                  {createMutation.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Saving...</> : "Add Account"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Customer Form Page ────────────────────────────────────────────────────────

function CustomerFormPage({
  onCancel, customer, prefill,
}: {
  onCancel: () => void;
  customer?: Customer | null;
  prefill?: { data: ScannedData; docType: string; imageData: { name: string; type: string; size: number; data: string } | null };
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [blacklistAlert, setBlacklistAlert] = useState<string[] | null>(null);
  const [duplicateError, setDuplicateError] = useState<{ code: string; message: string; existing: { id: string; customerId: string; fullName: string; phonePrimary?: string } } | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(customer?.labels ?? []);

  const [secondaryPhones, setSecondaryPhones] = useState<string[]>(customer?.phoneSecondary ?? []);
  const addSecondaryPhone = () => setSecondaryPhones(prev => [...prev, "+967"]);
  const removeSecondaryPhone = (idx: number) => setSecondaryPhones(prev => prev.filter((_, i) => i !== idx));
  const updateSecondaryPhone = (idx: number, val: string) => setSecondaryPhones(prev => prev.map((p, i) => i === idx ? val : p));

  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  // ── Multi-document state ───────────────────────────────────────────────────
  const initDocs = (): DocItem[] => {
    const raw = (customer?.documentation as any[]) ?? [];
    const existing = raw.map((d, i) => ({
      id: String(i),
      type: d.type ?? "national_id",
      customLabel: d.customLabel ?? "",
      number: d.number ?? "",
      issueDate: d.issue_date ?? "",
      expiryDate: d.expiry_date ?? "",
      imageData: d.imageData ?? null,
      storagePath: d.storagePath ?? undefined,
    }));
    // If we have scanned prefill data, inject it as the first document
    if (prefill) {
      const prefillDoc: DocItem = {
        id: "scan-prefill",
        type: prefill.docType,
        customLabel: "",
        number: prefill.data.documentNumber ?? "",
        issueDate: prefill.data.issueDate ?? "",
        expiryDate: prefill.data.expiryDate ?? "",
        imageData: prefill.imageData,
      };
      return [prefillDoc, ...existing];
    }
    return existing;
  };
  const [documents, setDocuments] = useState<DocItem[]>(initDocs);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocItem | null>(null);
  const [docForm, setDocForm] = useState<Omit<DocItem, "id">>({ type: "national_id", customLabel: "", number: "", issueDate: "", expiryDate: "", imageData: null });
  const docFileRef = useRef<HTMLInputElement>(null);

  const resetOcrState = () => { setOcrLoading(false); setOcrProgress(0); };
  const openAddDoc = () => {
    setEditingDoc(null);
    setDocForm({ type: "national_id", customLabel: "", number: "", issueDate: "", expiryDate: "", imageData: null, storagePath: undefined });
    resetOcrState();
    if (docFileRef.current) docFileRef.current.value = "";
    setDocDialogOpen(true);
  };
  const openEditDoc = (doc: DocItem) => {
    setEditingDoc(doc);
    setDocForm({ type: doc.type, customLabel: doc.customLabel ?? "", number: doc.number, issueDate: doc.issueDate, expiryDate: doc.expiryDate, imageData: doc.imageData, storagePath: doc.storagePath });
    resetOcrState();
    setDocDialogOpen(true);
  };
  const removeDoc = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id));
  const saveDoc = () => {
    if (!docForm.type) return;
    const formWithStorage = { ...docForm };
    if (editingDoc) {
      setDocuments(prev => prev.map(d => d.id === editingDoc.id ? { ...d, ...formWithStorage } : d));
    } else {
      setDocuments(prev => [...prev, { id: Date.now().toString(), ...formWithStorage }]);
    }
    setDocDialogOpen(false);
  };
  const [uploadingFile, setUploadingFile] = useState(false);
  const handleDocFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast({ title: "File too large", description: "Max 8 MB", variant: "destructive" }); return; }

    if (customer?.id) {
      setUploadingFile(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/customers/${customer.id}/kyc-upload`, { method: "POST", body: formData, credentials: "include" });
        if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Upload failed"); }
        const data = await res.json();
        setDocForm(prev => ({
          ...prev,
          storagePath: data.storagePath,
          imageData: { name: data.originalName, type: data.mimeType, size: data.size, data: "" },
        }));
        toast({ title: "File uploaded", description: `${data.originalName} stored securely` });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      } finally { setUploadingFile(false); }
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setDocForm(prev => ({ ...prev, imageData: { name: file.name, type: file.type, size: file.size, data: reader.result as string } }));
      };
      reader.readAsDataURL(file);
    }
  };

  const { data: customerGroups } = useQuery<CustomerGroup[]>({ queryKey: ["/api/customer-groups"] });

  const existingCity   = (customer?.demographics as any)?.city ?? "";
  const cityParts = existingCity.split(" — ");
  const existingGov    = prefill?.data.governorate ?? cityParts[0] ?? "";
  const existingDistrict = prefill?.data.district ?? cityParts[1] ?? "";
  const existingSubDistrict = prefill?.data.subdistrict ?? cityParts[2] ?? "";

  const [selectedGov, setSelectedGov]      = useState(existingGov);
  const [selectedDistrict, setSelectedDistrict] = useState(existingDistrict);
  const [selectedSubDistrict, setSelectedSubDistrict] = useState(existingSubDistrict);

  const runOcr = async (imageDataUrl: string) => {
    setOcrLoading(true);
    setOcrProgress(0);
    try {
      const { data } = await Tesseract.recognize(imageDataUrl, "ara+eng", {
        logger: (m: any) => { if (m.status === "recognizing text") setOcrProgress(Math.round(m.progress * 100)); },
      });
      const text = data.text;
      const datePatterns = text.match(/\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}/g) ?? [];
      const idPatterns = text.match(/\d{6,15}/g) ?? [];
      const extracted: { number?: string; issueDate?: string; expiryDate?: string } = {};
      const firstId = idPatterns[0];
      if (firstId && !docForm.number) extracted.number = firstId;
      const firstDate = datePatterns[0];
      const secondDate = datePatterns[1];
      if (firstDate && secondDate) {
        if (!docForm.issueDate) extracted.issueDate = firstDate.replace(/\//g, "-");
        if (!docForm.expiryDate) extracted.expiryDate = secondDate.replace(/\//g, "-");
      } else if (firstDate) {
        if (!docForm.expiryDate) extracted.expiryDate = firstDate.replace(/\//g, "-");
      }

      const allGovNames = YEMEN_GOVERNORATES.map(g => g.name);
      const allDistNames = YEMEN_GOVERNORATES.flatMap(g => g.districts.map(d => d.name));
      const foundGov = allGovNames.find(n => text.includes(n));
      const foundDist = allDistNames.find(n => text.includes(n));

      if (Object.keys(extracted).length > 0) {
        setDocForm(prev => ({ ...prev, ...extracted }));
        toast({ title: "OCR Complete", description: `Extracted: ${Object.keys(extracted).join(", ")}${foundGov ? ` | محافظة: ${foundGov}` : ""}${foundDist ? ` | مديرية: ${foundDist}` : ""}` });
      } else {
        toast({ title: "OCR Complete", description: `No structured data found. Raw text available.${foundGov ? ` | محافظة: ${foundGov}` : ""}`, variant: "default" });
      }

      if (foundGov && !selectedGov) { setSelectedGov(foundGov); form.setValue("city", foundGov); }
      if (foundDist && !selectedDistrict) { setSelectedDistrict(foundDist); form.setValue("district", foundDist); }
    } catch (err) {
      toast({ title: "OCR Failed", description: "Could not process image", variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      firstName:          customer?.firstName       ?? "",
      secondName:         customer?.secondName      ?? "",
      thirdName:          customer?.thirdName       ?? "",
      lastName:           customer?.lastName        ?? "",
      fullName:           prefill?.data.fullName ?? customer?.fullName ?? "",
      email:              customer?.email           ?? "",
      phonePrimary:       customer?.phonePrimary    ?? "+967",
      whatsappGroupId:    customer?.whatsappGroupId ?? "",
      customerStatus:     customer?.customerStatus  ?? "active",
      verificationStatus: customer?.verificationStatus ?? "unverified",
      riskLevel:          customer?.riskLevel       ?? "low",
      loyaltyGroup:       (() => {
        const raw = customer?.loyaltyGroup ?? "standard";
        if (!customerGroups?.length) return raw;
        if (customerGroups.find(g => g.code === raw)) return raw;
        const byName = customerGroups.find(g => g.name === raw);
        return byName ? byName.code : raw;
      })(),
      notes:              customer?.notes           ?? "",
      gender:             prefill?.data.gender ?? (customer?.demographics as any)?.gender ?? "",
      dateOfBirth:        prefill?.data.dateOfBirth ?? (customer?.demographics as any)?.dob ?? "",
      country:            (customer?.demographics as any)?.country     ?? "Yemen",
      city:               existingGov,
      district:           existingDistrict,
      subDistrict:        existingSubDistrict,
      address:            (customer?.demographics as any)?.address     ?? "",
    },
  });

  const watchFirst  = form.watch("firstName");
  const watchSecond = form.watch("secondName");
  const watchThird  = form.watch("thirdName");
  const watchLast   = form.watch("lastName");

  const handleNameBlur = () => {
    const parts = [watchFirst, watchSecond, watchThird, watchLast].filter(Boolean);
    form.setValue("fullName", parts.join(" "));
  };

  const mutation = useMutation({
    mutationFn: async (data: CustomerForm) => {
      const { gender, dateOfBirth, country, city, district, subDistrict, address, ...rest } = data;
      const cityParts = [selectedGov, selectedDistrict, selectedSubDistrict].filter(Boolean);
      const cityValue = cityParts.join(" — ");
      const payload = {
        ...rest,
        phoneSecondary: secondaryPhones.filter(p => p && p.length > 4),
        labels: selectedLabels,
        demographics: { gender, dob: dateOfBirth, country: "Yemen", city: cityValue, address },
        documentation: documents.map(d => ({
          type: d.type,
          customLabel: d.customLabel || undefined,
          number: d.number || undefined,
          issue_date: d.issueDate || undefined,
          expiry_date: d.expiryDate || undefined,
          storagePath: d.storagePath || undefined,
          imageData: d.storagePath
            ? { name: d.imageData?.name, type: d.imageData?.type, size: d.imageData?.size }
            : (d.imageData || undefined),
        })),
      };
      const method = customer ? "PATCH" : "POST";
      const url    = customer ? `/api/customers/${customer.id}` : "/api/customers";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.status === 409) {
        // Throw a structured duplicate error so onError can distinguish
        const err: any = new Error(json.message);
        err.code     = json.code;
        err.existing = json.existing;
        throw err;
      }
      if (!res.ok) throw new Error(json.message ?? "Failed to save customer");
      return json;
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDuplicateError(null);
      if (response.blacklistHits?.length > 0) {
        // Customer WAS created but forced to suspended — show warning and stay on page briefly
        setBlacklistAlert(response.blacklistHits.map((h: any) => h.subjectName || h.reason || "Match"));
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        setTimeout(() => onCancel(), 4000);
        return;
      }
      toast({ title: customer ? "Customer updated" : "Customer created" });
      onCancel();
    },
    onError: (e: any) => {
      if (e.code === "DUPLICATE_PHONE" || e.code === "DUPLICATE_NAME") {
        setDuplicateError({ code: e.code, message: e.message, existing: e.existing });
        return;
      }
      toast({ title: "Error saving customer", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6 max-w-3xl">
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-back-customer" className="h-8 px-2 sm:px-3 shrink-0">
          <ArrowLeft className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Back</span>
        </Button>
        <div className="h-5 w-px bg-border shrink-0" />
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
          </div>
          <h1 className="text-base sm:text-lg font-bold truncate">{customer ? `Edit — ${customer.fullName}` : "New Customer"}</h1>
        </div>
      </div>

      {prefill && (
        <Alert className="mb-4 border-primary/30 bg-primary/5">
          <Camera className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs">
            <strong>Pre-filled from document scan.</strong> Review the extracted data below — fields have been auto-filled from the scanned {prefill.docType === "passport" ? "passport" : "national ID"}. Edit any incorrect values before saving.
          </AlertDescription>
        </Alert>
      )}

      {blacklistAlert && (
        <Alert variant="destructive" className="mb-4">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            <strong>Blacklist Match!</strong> Customer matches blacklist entries:
            <ul className="mt-1 list-disc list-inside">
              {blacklistAlert.map((r, i) => <li key={i} className="text-xs">{r}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <Tabs defaultValue="personal">
            <TabsList className="flex w-full overflow-x-auto">
              <TabsTrigger value="personal"  className="flex-1 min-w-[80px] text-xs sm:text-sm whitespace-nowrap">Personal</TabsTrigger>
              <TabsTrigger value="kyc"       className="flex-1 min-w-[80px] text-xs sm:text-sm whitespace-nowrap">KYC & Docs</TabsTrigger>
              <TabsTrigger value="settings"  className="flex-1 min-w-[80px] text-xs sm:text-sm whitespace-nowrap">Status</TabsTrigger>
              {customer && <TabsTrigger value="wallets" className="flex-1 min-w-[80px] text-xs sm:text-sm whitespace-nowrap">Wallets</TabsTrigger>}
            </TabsList>

            {/* ── Personal Info ──────────────────────────────── */}
            <TabsContent value="personal" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First *</FormLabel>
                    <FormControl><Input placeholder="Ali" {...field} onBlur={handleNameBlur} data-testid="input-firstname" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="secondName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Second</FormLabel>
                    <FormControl><Input placeholder="Ahmed" {...field} onBlur={handleNameBlur} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="thirdName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Third</FormLabel>
                    <FormControl><Input placeholder="Saleh" {...field} onBlur={handleNameBlur} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">Family <InfoTip text="Last name / family name used for identification" /></FormLabel>
                    <FormControl><Input placeholder="Al-Yamani" {...field} onBlur={handleNameBlur} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Full Name * <InfoTip text="Auto-composed from name parts above, editable" /></FormLabel>
                  <FormControl><Input placeholder="Ali Ahmed Saleh Al-Yamani" {...field} data-testid="input-fullname" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="phonePrimary" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="7X XXX XXXX"
                          data-testid="input-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" placeholder="email@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                {secondaryPhones.map((phone, idx) => (
                  <div key={`sp-${idx}-${secondaryPhones.length}`} className="flex items-end gap-2">
                    <div className="flex-1">
                      {idx === 0 && <p className="text-sm font-medium mb-1.5 flex items-center gap-1">Alternative Phones <InfoTip text="Additional contact numbers for this customer" /></p>}
                      <PhoneInput value={phone} onChange={v => updateSecondaryPhone(idx, v)} placeholder="7X XXX XXXX" data-testid={`input-phone-alt-${idx}`} />
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive" onClick={() => removeSecondaryPhone(idx)} data-testid={`button-remove-phone-${idx}`}>
                      <Minus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addSecondaryPhone} data-testid="button-add-phone">
                  <Plus className="w-3.5 h-3.5 mr-1" />Add Alternative Phone
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="gender" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger data-testid="select-gender"><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">DOB <InfoTip text="YYYY-MM-DD or DD-MM-YYYY" /></FormLabel>
                    <FormControl>
                      <SmartDateInput value={field.value ?? ""} onChange={field.onChange} placeholder="YYYY-MM-DD" data-testid="input-dob" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Country defaults to Yemen — no editable field */}

              <div>
                <p className="text-sm font-medium mb-1.5">الموقع (المحافظة — المديرية — العزلة)</p>
                <YemenCityPicker
                  governorateValue={selectedGov}
                  districtValue={selectedDistrict}
                  subDistrictValue={selectedSubDistrict}
                  onChangeGovernorate={v => { setSelectedGov(v); form.setValue("city", v); }}
                  onChangeDistrict={v => { setSelectedDistrict(v); form.setValue("district", v); }}
                  onChangeSubDistrict={v => { setSelectedSubDistrict(v); form.setValue("subDistrict", v); }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl><Input placeholder="Street / building / area" {...field} className="w-full" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="whatsappGroupId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">WA Group <InfoTip text="WhatsApp group ID for notifications" /></FormLabel>
                    <FormControl><Input placeholder="grp-001" {...field} data-testid="input-wa-group" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      placeholder="Internal notes, special instructions, customer preferences..."
                      {...field}
                      rows={4}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]"
                      data-testid="input-notes"
                    />
                  </FormControl>
                </FormItem>
              )} />
            </TabsContent>

            {/* ── KYC & Documents ────────────────────────────── */}
            <TabsContent value="kyc" className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1">KYC Documents <InfoTip text="ID front/back, passport, proof of address, selfie, etc." /></p>
                <Button type="button" size="sm" onClick={openAddDoc} data-testid="button-add-document">
                  <Plus className="w-3.5 h-3.5 mr-1" />Add Document
                </Button>
              </div>

              {documents.length === 0 ? (
                <div className="flex flex-col items-center py-8 border border-dashed border-border rounded-xl text-center">
                  <FileText className="w-7 h-7 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No documents added yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Add ID, passport, proof of address, or any supporting file</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => {
                    const docLabel = DOC_TYPES.find(t => t.value === doc.type)?.label ?? doc.type;
                    const hasFile = !!doc.imageData || !!doc.storagePath;
                    const hasInlineImage = doc.imageData?.data && doc.imageData.type?.startsWith("image/");
                    const isStorageBacked = !!doc.storagePath;
                    return (
                      <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20" data-testid={`doc-${doc.id}`}>
                        {hasInlineImage ? (
                          <button type="button" onClick={() => setPreviewDoc(doc)} className="w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0 hover:ring-2 ring-primary transition-all cursor-pointer">
                            <img src={doc.imageData!.data} alt={docLabel} className="w-full h-full object-cover" />
                          </button>
                        ) : isStorageBacked ? (
                          <button type="button" onClick={() => setPreviewDoc(doc)} className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center border border-border shrink-0 hover:ring-2 ring-primary transition-all cursor-pointer">
                            <FileText className="w-5 h-5 text-primary" />
                          </button>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{docLabel}</span>
                            {doc.customLabel && <span className="text-xs text-muted-foreground">({doc.customLabel})</span>}
                            {isStorageBacked && <Badge variant="secondary" className="text-xs"><CheckCircle className="w-2.5 h-2.5 mr-1" />Stored</Badge>}
                            {hasFile && !isStorageBacked && <Badge variant="secondary" className="text-xs"><Upload className="w-2.5 h-2.5 mr-1" />File attached</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {doc.number && <span className="font-mono mr-2">{doc.number}</span>}
                            {doc.expiryDate && <span>Expires: {doc.expiryDate}</span>}
                            {doc.imageData?.name && <span className="ml-2">{doc.imageData.name}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasFile && (
                            <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => setPreviewDoc(doc)} data-testid={`button-preview-doc-${doc.id}`}>
                              <Eye className="w-3 h-3" />
                            </Button>
                          )}
                          <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => openEditDoc(doc)}><Edit2 className="w-3 h-3" /></Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeDoc(doc.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add / Edit Document Dialog */}
              <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                      <FileText className="w-4 h-4 text-primary" />{editingDoc ? "Edit Document" : "Add Document"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Document Type *</label>
                        <Select value={docForm.type} onValueChange={v => setDocForm(prev => ({ ...prev, type: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Custom Label <span className="text-muted-foreground font-normal">(optional)</span></label>
                        <Input placeholder='e.g. "Main ID"' value={docForm.customLabel ?? ""} onChange={e => setDocForm(prev => ({ ...prev, customLabel: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Document Number</label>
                      <Input placeholder="e.g. Y-12345678" className="font-mono" value={docForm.number} onChange={e => setDocForm(prev => ({ ...prev, number: e.target.value }))} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Issue Date</label>
                        <SmartDateInput value={docForm.issueDate} onChange={v => setDocForm(prev => ({ ...prev, issueDate: v }))} placeholder="YYYY-MM-DD" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Expiry Date</label>
                        <SmartDateInput value={docForm.expiryDate} onChange={v => setDocForm(prev => ({ ...prev, expiryDate: v }))} placeholder="YYYY-MM-DD" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Scan / Photo</label>
                      <input ref={docFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleDocFileSelect} />
                      {uploadingFile ? (
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                          <p className="text-sm text-blue-700 dark:text-blue-300">Uploading to secure storage...</p>
                        </div>
                      ) : docForm.imageData ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700">
                            {docForm.storagePath ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <FileText className="w-4 h-4 text-emerald-600 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-emerald-700 dark:text-emerald-300 truncate">{docForm.imageData.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(docForm.imageData.size / 1024).toFixed(0)} KB
                                {docForm.storagePath && <span className="ml-2 text-emerald-600">· Stored securely</span>}
                              </p>
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0" onClick={() => { setDocForm(prev => ({ ...prev, imageData: null, storagePath: undefined })); if (docFileRef.current) docFileRef.current.value = ""; }}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                          {docForm.imageData.type?.startsWith("image/") && (
                            <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
                              <img src={docForm.imageData.data} alt="Preview" className="w-full max-h-48 object-contain" />
                            </div>
                          )}
                          {docForm.imageData.type?.startsWith("image/") && (
                            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => runOcr(docForm.imageData!.data)} disabled={ocrLoading} data-testid="button-ocr-extract">
                              {ocrLoading ? (
                                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Extracting... {ocrProgress}%</>
                              ) : (
                                <><ScanLine className="w-3.5 h-3.5 mr-1.5" />Extract Data (OCR) — Arabic + English</>
                              )}
                            </Button>
                          )}
                          {docForm.imageData.type === "application/pdf" && (
                            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { const w = window.open(); if (w) { w.document.write(`<iframe src="${docForm.imageData!.data}" style="width:100%;height:100%;border:none"></iframe>`); } }}>
                              <Eye className="w-3.5 h-3.5 mr-1.5" />View PDF
                            </Button>
                          )}
                        </div>
                      ) : (
                        <button type="button" onClick={() => docFileRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors" data-testid="button-upload-doc">
                          <Upload className="w-5 h-5 text-muted-foreground/50 mx-auto mb-1" />
                          <p className="text-sm text-muted-foreground">Click to upload scan or photo</p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">JPG, PNG, PDF · max 8 MB</p>
                        </button>
                      )}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" size="sm" onClick={() => setDocDialogOpen(false)}>Cancel</Button>
                    <Button type="button" size="sm" onClick={saveDoc} disabled={!docForm.type} data-testid="button-save-document">
                      {editingDoc ? "Save Changes" : "Add Document"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {previewDoc && (previewDoc.imageData || previewDoc.storagePath) && (
                <DocPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
              )}
            </TabsContent>

            {/* ── Status & Groups ─────────────────────────────── */}
            <TabsContent value="settings" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="customerStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="verificationStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">KYC <InfoTip text="Verification status for compliance" /></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-kyc"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="verified">Verified</SelectItem>
                        <SelectItem value="unverified">Unverified</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="riskLevel" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">Risk <InfoTip text="AML risk classification" /></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-risk"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="loyaltyGroup" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">Group <InfoTip text="Managed in Settings → Customer Groups" /></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "standard"}>
                      <FormControl><SelectTrigger data-testid="select-group"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        {customerGroups?.map(g => (
                          <SelectItem key={g.id} value={g.code}>
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: g.color }} />
                              {g.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>

              <div>
                <p className="text-sm font-medium mb-1.5 flex items-center gap-1">Labels <InfoTip text="Classify this customer with tags" /></p>
                <LabelMultiSelect selected={selectedLabels} onChange={setSelectedLabels} />
              </div>
            </TabsContent>

            {/* ── Wallet Whitelist ──────────────────────────── */}
            {customer && (
              <TabsContent value="wallets" className="pt-3">
                <CustomerWalletPanel customerId={customer.id} />
              </TabsContent>
            )}
          </Tabs>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="flex-1" data-testid="button-save-customer">
              {mutation.isPending ? "Saving..." : customer ? "Save Changes" : "Create Customer"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ── Customer History Dialog ───────────────────────────────────────────────────

interface HistoryRecord {
  id: string; recordNumber: string; type: "cash"|"crypto"; direction: "inflow"|"outflow";
  processingStage: string; amount: string; currency: string; usdEquivalent?: string;
  accountName?: string; assetOrProviderName?: string; notes?: string; createdAt: string;
}
const stageColors: Record<string, string> = {
  recorded:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  used:      "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};
const recTypeColors: Record<string, string> = {
  "cash-inflow":    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "cash-outflow":   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "crypto-inflow":  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "crypto-outflow": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

// ── Scan Document Dialog ──────────────────────────────────────────────────────
// Standalone AI-powered document scanner that:
// 1. User uploads/captures image of ID or passport
// 2. Tesseract.js extracts raw Arabic+English text client-side
// 3. Raw text sent to server → Deepseek AI structures it into fields
// 4. User reviews/edits extracted fields in form
// 5. On save: checks for existing customers with same name/doc number
//    → if match found: suggests editing that customer instead
//    → if no match: opens "New Customer" form pre-filled with data

interface ScannedData {
  fullName: string | null;
  documentNumber: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  governorate: string | null;
  district: string | null;
  subdistrict: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  gender: string | null;
  bloodType: string | null;
  docConfidence: number;
}

function ScanDocumentDialog({
  onClose,
  onCreateNew,
  onEditExisting,
}: {
  onClose: () => void;
  onCreateNew: (data: ScannedData, docType: string, imageData: { name: string; type: string; size: number; data: string } | null) => void;
  onEditExisting: (customerId: string, data: ScannedData, docType: string, imageData: { name: string; type: string; size: number; data: string } | null) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "ocr" | "review" | "duplicate">("upload");
  const [docType, setDocType] = useState<"national_id" | "passport">("national_id");
  const [imageData, setImageData] = useState<{ name: string; type: string; size: number; data: string } | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [rawOcrText, setRawOcrText] = useState("");
  const [scanned, setScanned] = useState<ScannedData>({
    fullName: null, documentNumber: null, dateOfBirth: null, placeOfBirth: null,
    governorate: null, district: null, subdistrict: null, issueDate: null,
    expiryDate: null, gender: null, bloodType: null, docConfidence: 0,
  });
  const [editedData, setEditedData] = useState<ScannedData>({ ...scanned });
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [checking, setChecking] = useState(false);

  const updateField = (key: keyof ScannedData, val: string | null) =>
    setEditedData(prev => ({ ...prev, [key]: val }));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData({ name: file.name, type: file.type, size: file.size, data: reader.result as string });
      setStep("ocr");
      runOcrAndParse(reader.result as string, file.type);
    };
    reader.readAsDataURL(file);
  };

  const runOcrAndParse = async (dataUrl: string, mimeType: string) => {
    setOcrProgress(0);
    setRawOcrText("");
    try {
      // Step 1: Tesseract extracts raw text
      const { data } = await Tesseract.recognize(dataUrl, "ara+eng", {
        logger: (m: any) => {
          if (m.status === "recognizing text") setOcrProgress(Math.round(m.progress * 70));
        },
      });
      const rawText = data.text;
      setRawOcrText(rawText);
      setOcrProgress(75);

      // Step 2: Send raw text to Deepseek for intelligent parsing
      const res = await fetch("/api/ocr/scan-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rawText, documentType: docType }),
      });
      setOcrProgress(95);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "AI parsing failed");
      }

      const json = await res.json();
      const extracted: ScannedData = {
        fullName: json.extracted?.fullName ?? null,
        documentNumber: json.extracted?.documentNumber ?? null,
        dateOfBirth: json.extracted?.dateOfBirth ?? null,
        placeOfBirth: json.extracted?.placeOfBirth ?? null,
        governorate: json.extracted?.governorate ?? null,
        district: json.extracted?.district ?? null,
        subdistrict: json.extracted?.subdistrict ?? null,
        issueDate: json.extracted?.issueDate ?? null,
        expiryDate: json.extracted?.expiryDate ?? null,
        gender: json.extracted?.gender ?? null,
        bloodType: json.extracted?.bloodType ?? null,
        docConfidence: json.extracted?.docConfidence ?? 0,
      };
      setScanned(extracted);
      setEditedData(extracted);
      setOcrProgress(100);
      setStep("review");
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      setStep("upload");
    }
  };

  const checkDuplicates = async () => {
    setChecking(true);
    try {
      const params = new URLSearchParams();
      if (editedData.fullName) params.set("search", editedData.fullName);
      const res = await fetch(`/api/customers?${params.toString()}`, { credentials: "include" });
      const list: Customer[] = await res.json();

      const matches = list.filter(c => {
        const nameMatch = editedData.fullName && c.fullName &&
          c.fullName.includes(editedData.fullName.split(" ")[0]);
        const docMatch = editedData.documentNumber && (c.documentation as any[] ?? [])
          .some((d: any) => d.number === editedData.documentNumber);
        return nameMatch || docMatch;
      });

      if (matches.length > 0) {
        setDuplicates(matches);
        setStep("duplicate");
      } else {
        // No duplicate — go straight to create new
        onCreateNew(editedData, docType, imageData);
      }
    } catch {
      onCreateNew(editedData, docType, imageData);
    } finally {
      setChecking(false);
    }
  };

  const confidence = editedData.docConfidence ?? 0;
  const confidenceColor = confidence >= 80 ? "text-emerald-600" : confidence >= 50 ? "text-amber-600" : "text-red-500";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg mx-auto h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto rounded-none sm:rounded-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="w-4 h-4 text-primary" />
            Scan Identity Document
          </DialogTitle>
          <DialogDescription className="text-xs">
            Take a photo or choose from gallery — AI will extract data automatically
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Upload ──────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(["national_id", "passport"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  data-testid={`scan-type-${t}`}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    docType === t
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {t === "national_id" ? "🪪 National ID" : "📘 Passport"}
                </button>
              ))}
            </div>

            {/* Two hidden inputs — one for camera, one for gallery */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <input
              ref={el => { if (el) (el as any).__cameraRef = true; }}
              id="scan-camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => document.getElementById("scan-camera-input")?.click()}
                data-testid="button-scan-camera"
                className="flex flex-col items-center gap-2 p-5 border-2 border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <Camera className="w-8 h-8 text-primary/60" />
                <span className="text-sm font-medium">Take Photo</span>
                <span className="text-xs text-muted-foreground">Use camera</span>
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                data-testid="button-scan-upload"
                className="flex flex-col items-center gap-2 p-5 border-2 border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <Upload className="w-8 h-8 text-primary/60" />
                <span className="text-sm font-medium">Choose File</span>
                <span className="text-xs text-muted-foreground">From gallery</span>
              </button>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Tips for best results:</p>
              <ul className="text-xs text-muted-foreground/80 space-y-0.5 list-disc list-inside">
                <li>Place document on a flat, dark surface</li>
                <li>Ensure all 4 corners are visible</li>
                <li>Good lighting — no glare or shadows</li>
                <li>Hold camera steady — no blur</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── Step 2: OCR in progress ────────────────────────────── */}
        {step === "ocr" && (
          <div className="space-y-5 py-4">
            {imageData && (
              <div className="rounded-lg border border-border overflow-hidden max-h-40">
                <img src={imageData.data} alt="Document" className="w-full object-contain max-h-40" />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{ocrProgress < 75 ? "Reading text from image..." : ocrProgress < 95 ? "AI parsing Arabic fields..." : "Finalizing..."}</span>
                <span>{ocrProgress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting document data — please wait</span>
            </div>
          </div>
        )}

        {/* ── Step 3: Review extracted data ─────────────────────── */}
        {step === "review" && (
          <div className="space-y-4">
            {imageData && (
              <div className="rounded-lg border border-border overflow-hidden max-h-32">
                <img src={imageData.data} alt="Document" className="w-full object-contain max-h-32" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Extracted Data — review & correct if needed</p>
              <span className={`text-xs font-semibold ${confidenceColor}`}>
                {confidence}% confidence
              </span>
            </div>

            {rawOcrText && confidence < 60 && (
              <Alert>
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">
                  Low confidence — please check all fields carefully before saving.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Full Name (الاسم)</label>
                <Input
                  value={editedData.fullName ?? ""}
                  onChange={e => updateField("fullName", e.target.value || null)}
                  placeholder="محمد علي أحمد"
                  className="text-right font-arabic"
                  dir="rtl"
                  data-testid="scan-input-fullname"
                />
              </div>

              {/* Document Number */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {docType === "passport" ? "Passport Number" : "National ID Number (الرقم الوطني)"}
                </label>
                <Input
                  value={editedData.documentNumber ?? ""}
                  onChange={e => updateField("documentNumber", e.target.value || null)}
                  placeholder={docType === "passport" ? "10469482" : "6994-4094-3317"}
                  className="font-mono"
                  data-testid="scan-input-docnumber"
                />
              </div>

              {/* Date of Birth */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Date of Birth (تاريخ الميلاد)</label>
                  <Input
                    value={editedData.dateOfBirth ?? ""}
                    onChange={e => updateField("dateOfBirth", e.target.value || null)}
                    placeholder="YYYY-MM-DD"
                    data-testid="scan-input-dob"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Gender (الجنس)</label>
                  <Select
                    value={editedData.gender ?? ""}
                    onValueChange={v => updateField("gender", v || null)}
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male (ذكر)</SelectItem>
                      <SelectItem value="female">Female (أنثى)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Place of Birth */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Place of Birth (مكان الميلاد)</label>
                <Input
                  value={editedData.placeOfBirth ?? ""}
                  onChange={e => updateField("placeOfBirth", e.target.value || null)}
                  placeholder="عدن - المنصورة"
                  className="text-right"
                  dir="rtl"
                  data-testid="scan-input-placeofbirth"
                />
              </div>

              {/* Governorate / District / Subdistrict */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Governorate (المحافظة)</label>
                  <Input
                    value={editedData.governorate ?? ""}
                    onChange={e => updateField("governorate", e.target.value || null)}
                    placeholder="عدن"
                    className="text-right"
                    dir="rtl"
                    data-testid="scan-input-governorate"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">District (المديرية)</label>
                  <Input
                    value={editedData.district ?? ""}
                    onChange={e => updateField("district", e.target.value || null)}
                    placeholder="الشيخ عثمان"
                    className="text-right"
                    dir="rtl"
                    data-testid="scan-input-district"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Uzlah (العزلة)</label>
                  <Input
                    value={editedData.subdistrict ?? ""}
                    onChange={e => updateField("subdistrict", e.target.value || null)}
                    placeholder="—"
                    className="text-right"
                    dir="rtl"
                    data-testid="scan-input-subdistrict"
                  />
                </div>
              </div>

              {/* Issue / Expiry dates */}
              {(docType === "passport" || editedData.issueDate || editedData.expiryDate) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Issue Date</label>
                    <Input
                      value={editedData.issueDate ?? ""}
                      onChange={e => updateField("issueDate", e.target.value || null)}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Expiry Date</label>
                    <Input
                      value={editedData.expiryDate ?? ""}
                      onChange={e => updateField("expiryDate", e.target.value || null)}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => { setStep("upload"); setImageData(null); }}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />Rescan
              </Button>
              <Button
                type="button" size="sm" className="flex-1"
                onClick={checkDuplicates}
                disabled={checking || !editedData.fullName}
                data-testid="button-scan-continue"
              >
                {checking ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Checking...</> : <>Continue <ChevronRight className="w-3.5 h-3.5 ml-1" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Duplicate detected ─────────────────────────── */}
        {step === "duplicate" && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Possible duplicate detected.</strong> The following customers may already be in the system. Do you want to add this document to an existing customer or create a new one?
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              {duplicates.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors"
                  onClick={() => onEditExisting(c.id, editedData, docType, imageData)}
                  data-testid={`dup-customer-${c.id}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.fullName}</p>
                    <p className="text-xs text-muted-foreground">{c.customerId} · {c.phonePrimary}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>

            <Button
              type="button" variant="outline" className="w-full gap-1.5"
              onClick={() => onCreateNew(editedData, docType, imageData)}
              data-testid="button-scan-create-new"
            >
              <Plus className="w-3.5 h-3.5" />Create as New Customer
            </Button>

            <Button
              type="button" variant="ghost" size="sm" className="w-full"
              onClick={() => setStep("review")}
            >
              Back to Review
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocPreviewDialog({ doc, onClose }: { doc: DocItem; onClose: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (doc.storagePath && !doc.imageData?.data) {
      setLoading(true);
      fetch(`/api/kyc-document/signed-url?path=${encodeURIComponent(doc.storagePath)}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => { setSignedUrl(d.signedUrl); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [doc.storagePath, doc.imageData?.data]);

  const imageUrl = doc.imageData?.data || signedUrl;
  const mimeType = doc.imageData?.type ?? "";
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 text-primary" />
            {DOC_TYPES.find(t => t.value === doc.type)?.label ?? doc.type}
            {doc.customLabel && <span className="text-muted-foreground font-normal">({doc.customLabel})</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading document...</div>
          ) : imageUrl && isImage ? (
            <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
              <img src={imageUrl} alt="Document preview" className="w-full object-contain max-h-[60vh]" />
            </div>
          ) : imageUrl && isPdf ? (
            <iframe src={imageUrl} className="w-full h-[60vh] rounded-lg border border-border" title="PDF Preview" />
          ) : imageUrl ? (
            <div className="text-center py-8">
              <a href={imageUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline" data-testid="link-download-doc">
                Open Document
              </a>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-3 text-sm">
            {doc.number && <div><p className="text-xs text-muted-foreground">Document Number</p><p className="font-mono font-semibold">{doc.number}</p></div>}
            {doc.issueDate && <div><p className="text-xs text-muted-foreground">Issue Date</p><p className="font-semibold">{doc.issueDate}</p></div>}
            {doc.expiryDate && <div><p className="text-xs text-muted-foreground">Expiry Date</p><p className="font-semibold">{doc.expiryDate}</p></div>}
          </div>
          {doc.storagePath && (
            <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Stored in secure cloud storage
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerHistoryDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { data: records, isLoading: recLoading } = useQuery<HistoryRecord[]>({
    queryKey: ["/api/records", customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/records?customerId=${customer.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const totalVolume = records?.reduce((s, r) => s + (parseFloat(r.usdEquivalent ?? "0") || 0), 0) ?? 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4 text-primary" />
            History — {customer.fullName}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{customer.customerId}</span> · {customer.phonePrimary}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-center text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Records</p>
            <p className="font-bold text-lg">{records?.length ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Total Volume</p>
            <p className="font-bold text-lg text-primary">${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>

        <div className="mt-2 space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />Records ({records?.length ?? 0})
          </p>
          {recLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          : !records?.length ? <div className="flex flex-col items-center py-10 text-muted-foreground"><FileText className="w-8 h-8 mb-2 opacity-30" /><p className="text-sm">No records yet</p></div>
          : records.map(r => {
            const key = `${r.type}-${r.direction}`;
            return (
              <div key={r.id} className="p-3 rounded-lg border border-border text-sm" data-testid={`history-rec-${r.id}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{r.recordNumber}</span>
                    <Badge className={`text-[10px] px-1.5 ${recTypeColors[key] ?? ""}`}>{r.type} {r.direction}</Badge>
                    <Badge className={`text-[10px] px-1.5 ${stageColors[r.processingStage] ?? ""}`}>{r.processingStage.replace("_"," ")}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(r.createdAt), "MMM d, yy")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-bold">{parseFloat(r.amount).toLocaleString()} {r.currency}</span>
                  {r.usdEquivalent && <span className="text-xs text-muted-foreground">≈ ${parseFloat(r.usdEquivalent).toFixed(2)}</span>}
                  {(r.accountName || r.assetOrProviderName) && <span className="text-xs text-muted-foreground truncate">{r.accountName ?? r.assetOrProviderName}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Customers Page ───────────────────────────────────────────────────────

export default function Customers() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(() => {
    try {
      const saved = sessionStorage.getItem("cust_formMode");
      return saved === "create" || saved === "edit" ? saved : null;
    } catch { return null; }
  });
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(() => {
    try { return sessionStorage.getItem("cust_editId"); } catch { return null; }
  });
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  // Scanned data pre-fill: passed into CustomerFormPage when creating from scan
  const [scannedPrefill, setScannedPrefill] = useState<{
    data: ScannedData; docType: string;
    imageData: { name: string; type: string; size: number; data: string } | null;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: customerList, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers", search, statusFilter, verificationFilter, riskFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (verificationFilter !== "all") params.set("verificationStatus", verificationFilter);
      if (riskFilter !== "all") params.set("riskLevel", riskFilter);
      const res = await fetch(`/api/customers?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
  });

  useEffect(() => {
    try {
      if (formMode) sessionStorage.setItem("cust_formMode", formMode);
      else sessionStorage.removeItem("cust_formMode");
    } catch {}
  }, [formMode]);

  useEffect(() => {
    if (pendingEditId && customerList) {
      const found = customerList.find(c => c.id === pendingEditId);
      if (found) {
        setEditCustomer(found);
        setPendingEditId(null);
      } else {
        setPendingEditId(null);
        setFormMode(null);
        try { sessionStorage.removeItem("cust_editId"); sessionStorage.removeItem("cust_formMode"); } catch {}
      }
    }
  }, [pendingEditId, customerList]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/customers/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleScanCreateNew = (data: ScannedData, docType: string, imgData: { name: string; type: string; size: number; data: string } | null) => {
    setScanOpen(false);
    setScannedPrefill({ data, docType, imageData: imgData });
    setEditCustomer(null);
    setFormMode("create");
  };

  const handleScanEditExisting = (customerId: string, data: ScannedData, docType: string, imgData: { name: string; type: string; size: number; data: string } | null) => {
    setScanOpen(false);
    setScannedPrefill({ data, docType, imageData: imgData });
    // Find and open the existing customer
    const found = customerList?.find(c => c.id === customerId);
    if (found) {
      setEditCustomer(found);
      setFormMode("edit");
    } else {
      setPendingEditId(customerId);
      setFormMode("edit");
    }
  };

  if (formMode !== null) {
    if (formMode === "edit" && !editCustomer && pendingEditId) {
      return (
        <div className="flex items-center justify-center h-64">
          <Skeleton className="h-8 w-48" />
        </div>
      );
    }
    return (
      <CustomerFormPage
        key={editCustomer?.id ?? "new"}
        onCancel={() => {
          setFormMode(null);
          setEditCustomer(null);
          setScannedPrefill(null);
          try { sessionStorage.removeItem("cust_editId"); sessionStorage.removeItem("cust_formMode"); } catch {}
        }}
        customer={editCustomer}
        prefill={scannedPrefill ?? undefined}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      {scanOpen && (
        <ScanDocumentDialog
          onClose={() => setScanOpen(false)}
          onCreateNew={handleScanCreateNew}
          onEditExisting={handleScanEditExisting}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">Customers</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{customerList?.length ?? 0} customers</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setScanOpen(true)} data-testid="button-scan-document" className="h-8 px-2 sm:px-3">
            <Camera className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Scan</span>
          </Button>
          <Button size="sm" onClick={() => { setEditCustomer(null); setScannedPrefill(null); try { sessionStorage.removeItem("cust_editId"); } catch {} setFormMode("create"); }} data-testid="button-new-customer" className="h-8 px-2 sm:px-3">
            <Plus className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">New Customer</span>
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input data-testid="input-search" placeholder="Search by name, phone, ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {/* Filters row — scrollable on mobile */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[100px] shrink-0" data-testid="select-status-filter">
            <Filter className="w-3 h-3 mr-1 text-muted-foreground" /><SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={verificationFilter} onValueChange={setVerificationFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[110px] shrink-0"><SelectValue placeholder="KYC" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All KYC</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[100px] shrink-0"><SelectValue placeholder="Risk" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Customer List */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : !customerList?.length ? (
        <Card>
          <div className="flex flex-col items-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No customers found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {search || statusFilter !== "all" || riskFilter !== "all" ? "Try adjusting filters" : "Create your first customer"}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {customerList.map(customer => {
            const statusCfg  = statusConfig[customer.customerStatus];
            const verifCfg   = verificationConfig[customer.verificationStatus];
            const riskCfg    = riskConfig[customer.riskLevel];
            return (
              <Card key={customer.id} className="hover-elevate" data-testid={`card-customer-${customer.id}`}>
                <CardContent className="p-3 sm:p-4">
                  {/* Top row: avatar + name/phone + action buttons */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-xs sm:text-sm">
                      {customer.fullName.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + blacklist */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-foreground text-sm leading-tight">{customer.fullName}</p>
                        {customer.isBlacklisted && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0"><ShieldAlert className="w-2.5 h-2.5 mr-0.5" />BL</Badge>
                        )}
                      </div>
                      {/* Phone + ID */}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phonePrimary}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/70">{customer.customerId}</span>
                      </div>
                      {/* City (hidden on very small screens) */}
                      {(customer.demographics as any)?.city && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                          <Globe className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{(customer.demographics as any).city}</span>
                        </p>
                      )}
                    </div>

                    {/* Action buttons — always visible, compact */}
                    <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setHistoryCustomer(customer)} title="History" data-testid={`button-history-customer-${customer.id}`}>
                        <History className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditCustomer(customer); try { sessionStorage.setItem("cust_editId", customer.id); } catch {} setFormMode("edit"); }} data-testid={`button-edit-customer-${customer.id}`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      {(user?.role === "admin" || user?.role === "operations_manager") && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm(`Delete ${customer.fullName}?`)) deleteMutation.mutate(customer.id); }}
                          data-testid={`button-delete-customer-${customer.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Status badges row */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {statusCfg && <Badge className={`text-[10px] px-1.5 py-0 h-4 ${statusCfg.className}`}>{statusCfg.label}</Badge>}
                    {verifCfg  && <Badge className={`text-[10px] px-1.5 py-0 h-4 ${verifCfg.className}`}>{verifCfg.label}</Badge>}
                    {riskCfg   && <Badge className={`text-[10px] px-1.5 py-0 h-4 ${riskCfg.className}`}>{riskCfg.label}</Badge>}
                    {customer.loyaltyGroup && customer.loyaltyGroup !== "standard" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">{customer.loyaltyGroup}</Badge>
                    )}
                    {customer.labels?.slice(0, 2).map(l => (
                      <Badge key={l} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{l}</Badge>
                    ))}
                    {(customer.labels?.length ?? 0) > 2 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">+{(customer.labels?.length ?? 0) - 2}</Badge>
                    )}
                  </div>

                  {/* Bottom stats row */}
                  <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>{customer.totalTransactions} records</span>
                    <span>Vol: ${parseFloat(customer.totalVolumeUsd || "0").toLocaleString()}</span>
                    <span className="ml-auto">Since {format(new Date(customer.createdAt), "MMM yyyy")}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {historyCustomer && (
        <CustomerHistoryDialog customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />
      )}
    </div>
  );
}
