import { createRef, useCallback, useEffect, useRef, useState } from "react";
import {
  IonContent,
  IonHeader,
  IonPage,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonIcon,
  IonInput,
  IonList,
  IonFooter,
  IonText,
  IonMenuButton,
  useIonRouter,
  IonThumbnail,
  IonSkeletonText,
  IonImg,
} from "@ionic/react";
import { menuController } from "@ionic/core/components";
import { send } from "ionicons/icons";
import { useLiveQuery } from "dexie-react-hooks";
import "./css/Home.css";
import Message from "../components/Message";
import { db, IMessage, IVexInfo } from "../classes/vexDB";
import { analyzer } from "../classes/analyzer";
import utils from "../classes/utils";
import SideMenu from "../components/SideMenu";
import DateSeparator from "../components/DateSeparator";
//@ts-ignore
import BayesClassifier from "bayes";
import { useTranslation } from "react-i18next";

const Home: React.FC = () => {
  async function openFirstMenu() {
    await menuController.open("sideMenu");
  }
  const classifierModel = useLiveQuery(() => db.classifier.get(1), []);

  const router = useIonRouter();
  const messages = useLiveQuery<IMessage[]>(() => db.messages.toArray(), []);
  const [text, setText] = useState<string>("");
  const { t } = useTranslation();
  const [status, setStatus] = useState<string>("on-line");
  const vexInfo = useLiveQuery<IVexInfo[]>(() => db.vexInfo.toArray(), []);
  const [isTrainDisabled, setIsTrainDisabled] = useState<boolean>(false);
  const contentRef = createRef<HTMLIonContentElement>();

  const classifier: BayesClassifier = classifierModel?.classifierData
    ? BayesClassifier.fromJson(classifierModel?.classifierData)
    : BayesClassifier();

  const sendVexMessage = useCallback(
    async (content: string) => {
      // Obtendo as informações do localStorage uma vez para evitar leituras repetidas
      const bayesEnabled = localStorage.getItem("bayesEnabled");
      const useBayes = bayesEnabled === null || bayesEnabled === "true";
      const firstContact = localStorage.getItem("firstContact");

      // Atualizando estados antes do processamento
      setIsTrainDisabled(true);
      setStatus("digitando...");

      // Função auxiliar para lidar com a resposta do Bayes ou do analisador
      const handleResponse = async (answer: string) => {
        const answerLength = answer.length;

        // Calcula o timeout baseado no tamanho da resposta da Vex
        const timeout =
          answerLength > 30
            ? Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000
            : answerLength * 70;

        // Envia a mensagem com o timeout baseado no tamanho da resposta
        setTimeout(async () => {
          sendMessage(answer ?? (await utils.getResponse()), true);
          setStatus("on-line");
          setIsTrainDisabled(false);
          scrollToBottom();
        }, timeout);
      };

      // Função para lidar com o "firstContact" e abrir o menu
      const handleFirstContact = () => {
        if (firstContact === null) {
          setTimeout(() => {
            openFirstMenu();
            localStorage.setItem("firstContact", "true");
            setStatus("on-line");
            setIsTrainDisabled(false);
          }, 2000);
        }
      };

      // Processamento com Bayes
      if (useBayes) {
        console.log("with bayes");
        const answer = await classifier.categorize(content);

        if (!answer) {
          sendMessage(t("trainModelBefore"), true); // Mensagem de treinamento necessário
          handleFirstContact();
          setStatus("on-line");
          setIsTrainDisabled(false);
          scrollToBottom();
          return;
        }

        // Se houver resposta, envia a mensagem normalmente
        await handleResponse(answer);
      } else {
        // Processamento sem Bayes (usando o analisador)
        console.log("no bayes");
        const answer = await analyzer(content);

        // Resposta com timeout (simulando um delay na resposta)
        await handleResponse(answer);
      }
    },
    [classifier, analyzer, utils] // Dependências do hook
  );

  const sendMessage = (content: string, isVex: boolean) => {
    if (content.trim() === "") return;

    const newMessage: IMessage = {
      content,
      isVex,
      hour: new Date().toLocaleTimeString(),
      date: Date.now(),
    };
    scrollToBottom();

    db.messages.add(newMessage).catch((error) => {
      console.error("Error adding message to Dexie:", error);
    });
  };

  const shouldShowDateSeparator = (
    currentDate: number,
    previousDate: number
  ) => {
    const current = new Date(currentDate).toDateString();
    const previous = new Date(previousDate).toDateString();
    return current !== previous;
  };
  function scrollToBottom() {
    contentRef.current?.scrollToBottom(500);
  }

  // Função para deletar uma mensagem pelo ID
  const deleteMessage = async (id: number) => {
    try {
      await db.messages.delete(id);

      console.log(`Message with id ${id} deleted successfully`);
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };
  useEffect(() => {
    if (localStorage.getItem("language") === null) {
      router.push("/language", "root", "replace");
    }
  }, []);
  return (
    <>
      <SideMenu />
      <IonPage id="main-content">
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="end">
              <IonMenuButton></IonMenuButton>
            </IonButtons>
            <IonTitle>
              <div className="chat-contact">
                {!vexInfo ? (
                  <IonThumbnail slot="start">
                    <IonSkeletonText animated={true}></IonSkeletonText>
                  </IonThumbnail>
                ) : (
                  <IonThumbnail slot="start">
                    <IonImg src={vexInfo[0]?.profileImage ?? "/Vex_320.png"} />
                  </IonThumbnail>
                )}

                <div className="chat-contact-details">
                  <p>{vexInfo ? vexInfo[0]?.name : "Vex"}</p>
                  <IonText color="medium">{status}</IonText>
                </div>
              </div>
            </IonTitle>
          </IonToolbar>
        </IonHeader>

        <IonContent ref={contentRef} className="chat-content">
          <IonList>
            {messages?.map((msg: IMessage, index: number) => {
              const previousMsg = messages[index - 1];
              const showSeparator =
                previousMsg &&
                shouldShowDateSeparator(msg.date, previousMsg.date);

              return (
                <div key={`${msg.date}-${index}`}>
                  {showSeparator && <DateSeparator date={msg.date} />}

                  <Message
                    onClose={() => {
                      if (msg.id) deleteMessage(msg.id);
                    }}
                    content={msg.content}
                    isVex={msg.isVex}
                    hour={utils.formatHour(msg.hour)}
                    date={msg.date}
                  />
                </div>
              );
            })}
          </IonList>
        </IonContent>

        <IonFooter className="ion-padding">
          <IonInput
            clearInput={true}
            value={text}
            onIonInput={(event: React.ChangeEvent<HTMLInputElement>) => {
              setText(event.target.value);
            }}
            placeholder="Type a message..."
            label="Type a message..."
            labelPlacement="floating"
            fill="outline"
            shape="round"
            onKeyUp={(event: any) => {
              if (event.key === "Enter") {
                const copy = text;
                setText("");
                sendMessage(copy, false);
                sendVexMessage(copy);
              }
            }}
            disabled={isTrainDisabled}
          >
            <IonIcon
              onClick={() => {
                const copy = text;
                setText("");
                sendMessage(copy, false);
                sendVexMessage(copy);
              }}
              slot="end"
              icon={send}
              color="light"
            />
          </IonInput>
        </IonFooter>
      </IonPage>
    </>
  );
};

export default Home;
