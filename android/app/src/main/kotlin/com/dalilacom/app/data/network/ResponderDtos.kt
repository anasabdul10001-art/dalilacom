package com.dalilacom.app.data.network

import kotlinx.serialization.Serializable

@Serializable
data class ResponderStatusDto(
    val status: String,
    val running: Boolean,
    val trialAvailable: Boolean = false,
    val trialDays: Int = 0,
    val trialEndsAt: String? = null,
    val periodEnd: String? = null,
    val periodDays: Int = 30,
    val price: Int = 0,
    val creditName: String = "",
    val balance: Int = 0,
    val aiRepliesUsed: Int = 0,
    val aiReplyLimit: Int = 0,
    val businessDescription: String? = null,
    val tone: String? = null,
)

@Serializable
data class ChannelFieldDto(val key: String, val label: String, val secret: Boolean = false)

@Serializable
data class ChannelDto(
    val id: String,
    val key: String,
    val name: String,
    val connectable: Boolean,
    val fields: List<ChannelFieldDto> = emptyList(),
)

@Serializable
data class ConnectionDto(
    val id: String,
    val channel: String,
    val externalAccountId: String? = null,
    val isActive: Boolean,
    val hookUrl: String? = null,
    val driver: String = "",
    val supportsPosts: Boolean = false,
)

@Serializable
data class ConnectRequest(val channelId: String, val credentials: Map<String, String>)

@Serializable
data class ToggleRequest(val isActive: Boolean)

@Serializable
data class ProfileRequest(val businessDescription: String, val tone: String)

@Serializable
data class RuleDto(
    val id: String,
    val name: String,
    val keywords: List<String> = emptyList(),
    val mode: String,
    val replyTemplate: String = "",
    val aiInstructions: String = "",
    val postIds: List<String> = emptyList(),
    val isActive: Boolean = true,
)

@Serializable
data class CreateRuleRequest(
    val name: String,
    val keywords: List<String>,
    val mode: String,
    val replyTemplate: String,
    val aiInstructions: String,
    val postIds: List<String> = emptyList(),
)

@Serializable
data class InboxItemDto(
    val id: String,
    val channel: String = "",
    val authorName: String = "",
    val message: String = "",
    val intent: String? = null,
    val reply: String? = null,
    val status: String,
    val reason: String? = null,
)

@Serializable
data class SendReplyRequest(val reply: String)

@Serializable
data class WalletTxDto(val id: String, val type: String, val amount: Int, val ref: String? = null)

@Serializable
data class WalletDto(
    val balance: Int,
    val creditName: String = "",
    val transactions: List<WalletTxDto> = emptyList(),
)

@Serializable
data class LocalWalletDto(
    val key: String,
    val label: String,
    val accountNumber: String,
    val instructions: String? = null,
)

@Serializable
data class WalletMethodsDto(
    val creditName: String = "",
    val creditsPerUsd: Double = 0.0,
    val usdtTrc20Address: String? = null,
    val localWallets: List<LocalWalletDto> = emptyList(),
)

@Serializable
data class TopUpRequestBody(val method: String, val reference: String, val amountClaimed: Double? = null)

@Serializable
data class TopUpDto(val id: String, val status: String, val method: String = "", val amountCredits: Int? = null)

@Serializable
data class PostDto(
    val id: String,
    val text: String = "",
    val createdAt: String? = null,
    val url: String? = null,
    val image: String? = null,
)
