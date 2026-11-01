package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.DoctorCareDto
import com.dalilacom.app.data.network.DoctorCareRecordBody
import com.dalilacom.app.data.network.DoctorCareRecordDto
import com.dalilacom.app.data.network.DoctorCareRecordsDto
import com.dalilacom.app.data.network.DoctorCareRequestBody
import com.dalilacom.app.data.network.DoctorCareRespondBody
import com.dalilacom.app.data.network.DoctorAppointmentBookBody
import com.dalilacom.app.data.network.DoctorAppointmentListDto
import com.dalilacom.app.data.network.ClinicAppointmentListDto
import com.dalilacom.app.data.network.DoctorAppointmentScheduleDto
import com.dalilacom.app.data.network.DoctorAppointmentSettingsBody
import com.dalilacom.app.data.network.DoctorAppointmentSettingsDto
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall

class DoctorCareRepository(private val api: ApiService) {
    suspend fun appointmentSlots(doctorId: String): Result<DoctorAppointmentScheduleDto> = call({ api.doctorAppointmentSlots(doctorId) }, "Could not load appointment times")
    suspend fun bookAppointment(doctorId: String, startsAt: String, kind: String = "VISIT", shareMedicalFile: Boolean = false, visitReason: String = "") = call({ api.bookDoctorAppointment(doctorId, DoctorAppointmentBookBody(startsAt, kind, shareMedicalFile, visitReason)) }, "Could not book the appointment").map { }
    suspend fun myAppointments(): Result<DoctorAppointmentListDto> = call({ api.myDoctorAppointments() }, "Could not load appointments")
    suspend fun appointmentSettings(): Result<DoctorAppointmentSettingsDto> = call({ api.doctorAppointmentSettings() }, "Could not load booking settings")
    suspend fun saveAppointmentSettings(body: DoctorAppointmentSettingsBody): Result<DoctorAppointmentSettingsDto> = call({ api.saveDoctorAppointmentSettings(body) }, "Could not save booking settings")
    suspend fun clinicAppointments(): Result<ClinicAppointmentListDto> = call({ api.myClinicAppointments() }, "Could not load clinic appointments")
    suspend fun cancelAppointment(id: String) = call({ api.cancelDoctorAppointment(id) }, "Could not cancel appointment").map { }
    suspend fun load(): Result<DoctorCareDto> = call({ api.doctorCare() }, "Could not load medical care")
    suspend fun request(email: String): Result<Unit> = call({ api.requestPatient(DoctorCareRequestBody(email)) }, "Could not send request").map { }
    suspend fun respond(id: String, accept: Boolean): Result<Unit> = call({ api.respondDoctorRequest(id, DoctorCareRespondBody(accept)) }, "Could not answer request").map { }
    suspend fun revoke(id: String): Result<Unit> = call({ api.revokeDoctorCare(id) }, "Could not revoke access").map { }
    suspend fun records(id: String): Result<DoctorCareRecordsDto> = call({ api.doctorCareRecords(id) }, "Could not load records")
    suspend fun add(id: String, body: DoctorCareRecordBody): Result<DoctorCareRecordDto> = call({ api.addDoctorCareRecord(id, body) }, "Could not save update")

    private suspend inline fun <reified T> call(crossinline request: suspend () -> retrofit2.Response<T>, fallback: String): Result<T> {
        val response = safeApiCall { request() } ?: return Result.failure(Exception(fallback))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body)
        else Result.failure(Exception(errorText(response, fallback)))
    }
}
