"""
Egyptian Controlled / Scheduled Medicines Regulatory Policy & Validation.

Authoritative References:
- Egyptian Anti-Narcotics Law No. 182 of 1960.
- Egyptian Pharmacy Practice Law No. 127 of 1955.
- Ministry of Health & Population Decree No. 44 of 2026 (Published in El-Waqa'i' El-Misriyya No. 39 on Feb 17, 2026).
- Ministry of Health & Population Decree No. 242 of 2026 (Published in El-Waqa'i' El-Misriyya No. 179 on Aug 17, 2026).
- Egyptian Drug Authority (EDA) Guidelines on Dispensing Scheduled & Psychotropic Substances.

Effective Date: 2026-08-17 (following Decree 242/2026 updates).
"""
import enum
from typing import NamedTuple
from fastapi import HTTPException, status


class ControlledScheduleKey(str, enum.Enum):
    SCHEDULE_1 = "schedule_1"
    SCHEDULE_2 = "schedule_2"
    SCHEDULE_3 = "schedule_3"
    UNSCHEDULED_CONTROLLED = "unscheduled_controlled"


class SchedulePolicy(NamedTuple):
    schedule_key: str
    name_en: str
    name_ar: str
    requires_purchaser_name: bool
    requires_purchaser_id: bool
    requires_prescription_ref: bool
    requires_doctor_name: bool
    regulatory_reference: str
    description_ar: str
    description_en: str


# Authoritative, configurable schedule definitions & dispensing requirements
CONTROLLED_SCHEDULE_POLICIES: dict[str, SchedulePolicy] = {
    ControlledScheduleKey.SCHEDULE_1.value: SchedulePolicy(
        schedule_key="schedule_1",
        name_en="Schedule I (Narcotics / Strict Substances)",
        name_ar="جدول 1 مخدرات (جواهر مخدرة)",
        requires_purchaser_name=True,
        requires_purchaser_id=True,
        requires_prescription_ref=True,
        requires_doctor_name=True,
        regulatory_reference="Law 182/1960, MOH Decree 44/2026 & Decree 242/2026 (Table 1)",
        description_ar="الجواهر المخدرة والمواد المحظورة إلا بتذكرة طبية خاصة مدموغة. يلزم تسجيل اسم المستلم ورقمه القومي ورقم التذكرة واسم الطبيب.",
        description_en="Strict narcotic substances. Requires official special stamped prescription serial, purchaser National ID, and doctor details.",
    ),
    ControlledScheduleKey.SCHEDULE_2.value: SchedulePolicy(
        schedule_key="schedule_2",
        name_en="Schedule II (Psychotropics / Mental Health)",
        name_ar="جدول 2 مؤثرات عقلية (أدوية نفسية وعصبية)",
        requires_purchaser_name=True,
        requires_purchaser_id=True,
        requires_prescription_ref=True,
        requires_doctor_name=False,
        regulatory_reference="Law 182/1960, MOH Decree 44/2026 (Table 2)",
        description_ar="المؤثرات على الحالة النفسية. يلزم تسجيل اسم المشتري ورقمه القومي ورقم الروشتة الطبية المحتفظ بها في الصيدلية.",
        description_en="Psychotropic substances affecting the central nervous system. Requires purchaser Name, National ID, and retained Rx number.",
    ),
    ControlledScheduleKey.SCHEDULE_3.value: SchedulePolicy(
        schedule_key="schedule_3",
        name_en="Schedule III (Restricted Prescription Substances)",
        name_ar="جدول 3 أدوية تخضع لبعض قيود الجواهر المخدرة",
        requires_purchaser_name=True,
        requires_purchaser_id=False,
        requires_prescription_ref=True,
        requires_doctor_name=False,
        regulatory_reference="Law 182/1960 Table 3, MOH Decree 242/2026 (e.g. Alkyl Nitrites, CBD, Pregabalin)",
        description_ar="أدوية تخضع لبعض قيود الصرف والرقابة الدوائية. يلزم تسجيل رقم الروشتة واسم المشتري.",
        description_en="Substances subject to specific distribution restrictions under Decree 242/2026. Requires prescription reference and purchaser name.",
    ),
    ControlledScheduleKey.UNSCHEDULED_CONTROLLED.value: SchedulePolicy(
        schedule_key="unscheduled_controlled",
        name_en="Special Controlled (Local / Circular Monitoring)",
        name_ar="أدوية مراقبة تداول محلياً (منشورات دورية)",
        requires_purchaser_name=True,
        requires_purchaser_id=False,
        requires_prescription_ref=False,
        requires_doctor_name=False,
        regulatory_reference="Egyptian Drug Authority (EDA) Periodic Directives & Internal Quotas",
        description_ar="أصناف دوائية تحت الملاحظة التتبعية الداخلية أو تعليمات هيئة الدواء المحلية.",
        description_en="Medicines subject to internal quotas or temporary EDA monitoring circulars.",
    ),
}


def get_schedule_policy(schedule_key: str | None) -> SchedulePolicy | None:
    if not schedule_key:
        return None
    return CONTROLLED_SCHEDULE_POLICIES.get(schedule_key)


def validate_controlled_sale_compliance(
    schedules: list[str],
    purchaser_name: str | None,
    purchaser_id_number: str | None,
    purchaser_phone: str | None,
    prescription_reference: str | None,
    doctor_name: str | None,
    has_customer: bool = False,
) -> None:
    """
    Enforces classification-specific regulatory requirements on POS checkout.
    Raises 422 Unprocessable Entity with specific missing requirement details if violated.
    """
    clean_purchaser_name = (purchaser_name or "").strip()
    clean_purchaser_id = (purchaser_id_number or "").strip()
    clean_rx_ref = (prescription_reference or "").strip()
    clean_doc_name = (doctor_name or "").strip()

    # Determine highest applicable restrictions
    needs_purchaser_name = False
    needs_purchaser_id = False
    needs_rx_ref = False
    needs_doc_name = False
    violating_schedules: list[str] = []

    for sched in schedules:
        policy = get_schedule_policy(sched)
        if not policy:
            continue
        violating_schedules.append(policy.name_ar)
        if policy.requires_purchaser_name:
            needs_purchaser_name = True
        if policy.requires_purchaser_id:
            needs_purchaser_id = True
        if policy.requires_prescription_ref:
            needs_rx_ref = True
        if policy.requires_doctor_name:
            needs_doc_name = True

    errors: list[str] = []

    if needs_purchaser_name and not clean_purchaser_name and not has_customer:
        errors.append("اسم المستلم/المشتري الفعلي إلزامي (Purchaser name is mandatory)")

    if needs_purchaser_id and not clean_purchaser_id:
        errors.append("الرقم القومي أو جواز سفر المشتري إلزامي لأدوية هذا الجدول (Purchaser National ID / Passport is mandatory)")

    if needs_rx_ref and not clean_rx_ref:
        errors.append("رقم الروشتة / التذكرة الطبية إلزامي قانونياً لصرف هذا الصنف (Prescription reference is mandatory)")

    if needs_doc_name and not clean_doc_name:
        errors.append("اسم الطبيب المعالج إلزامي لأدوية جدول 1 (Prescribing doctor name is mandatory for Schedule I)")

    if errors:
        sched_names = " / ".join(violating_schedules) if violating_schedules else "أدوية مراقبة"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message_ar": f"مخالفة لضوابط صرف الأدوية المراقبة ({sched_names})",
                "message_en": "Controlled medicines regulatory compliance violation",
                "errors": errors,
            },
        )
