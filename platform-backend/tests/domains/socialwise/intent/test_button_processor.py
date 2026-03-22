from domains.socialwise.services.intent.button_processor import (
    button_to_user_text,
    detect_button_click,
    is_flow_button,
    is_handoff_button,
)


def test_detect_button_click_whatsapp_button_reply():
    payload = {
        "message": "Mandado de Segurança",
        "context": {
            "interaction_type": "button_reply",
            "message": {
                "content_attributes": {
                    "interaction_type": "button_reply",
                    "button_reply": {
                        "id": "flow_mtf_inicio",
                        "title": "Abrir fluxo",
                    },
                }
            },
        },
    }

    result = detect_button_click(payload, "Channel::WhatsApp")

    assert result.is_button_click is True
    assert result.button_id == "flow_mtf_inicio"
    assert result.button_title == "Abrir fluxo"
    assert is_flow_button(result.button_id) is True


def test_button_helpers_handle_handoff_and_payload_normalization():
    assert is_handoff_button("@falar_atendente") is True
    assert button_to_user_text("intent:mandado_de_seguranca") == "mandado_de_seguranca"
    assert button_to_user_text("@direito_civil") == "direito_civil"
