import { TbMessageChatbotFilled } from "react-icons/tb"

const ChatMessage = ({ chat }) => {
    return (
        !chat.hideInChat && (
            <div className={`message ${chat.role === 'model' ? 'bot' : 'user'}__message`}>
                {chat.role === 'model' && <TbMessageChatbotFilled className="icon" />}
                <p className="message__text">{chat.text}</p>
            </div>
        )
    )
}

export default ChatMessage