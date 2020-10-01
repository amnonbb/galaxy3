import React, {Component, Fragment} from 'react';
import MetaTags from 'react-meta-tags';
import {Janus} from "../../lib/janus";
import classNames from 'classnames';
import Dots from 'react-carousel-dots';
import {Accordion, Button, Icon, Image, Input, Label, Menu, Modal, Select} from "semantic-ui-react";
import {
    checkNotification,
    geoInfo,
    getMedia,
    getMediaStream,
    initJanus,
    micLevel,
    wkliLeave
} from "../../shared/tools";
import './MobileClient.scss'
import './MobileConteiner.scss'
import 'eqcss'
import {
    PROTOCOL_ROOM,
    VIDEO_240P_OPTION_VALUE,
    NO_VIDEO_OPTION_VALUE,
    vsettings_list,
} from "../../shared/consts";
import {GEO_IP_INFO} from "../../shared/env";
import platform from "platform";
import { isMobile } from 'react-device-detect';
import {withTranslation} from 'react-i18next';
import {languagesOptions, setLanguage} from '../../i18n/i18n';
import {Monitoring} from '../../components/Monitoring';
import {MonitoringData, LINK_STATE_INIT, LINK_STATE_GOOD, LINK_STATE_MEDIUM, LINK_STATE_WEAK} from '../../shared/MonitoringData';
import api from '../../shared/Api';
import {kc, isGhostOrGuest} from "../../components/UserManager";
import LoginPage from "../../components/LoginPage";
import GxyJanus from "../../shared/janus-utils";
import connectionOrange from '../VirtualApp/connection-orange.png';
import connectionWhite from '../VirtualApp/connection-white.png';
import connectionRed from '../VirtualApp/connection-red.png';
import connectionGray from '../VirtualApp/connection-gray.png';
import audioModeSvg from '../../shared/audio-mode.svg';
import fullModeSvg from '../../shared/full-mode-white.svg';
import VirtualStreamingMobile from './VirtualStreamingMobile';
import VirtualStreamingJanus from '../../shared/VirtualStreamingJanus';
import VirtualChat from '../VirtualApp/VirtualChat';
import ConfigStore from "../../shared/ConfigStore";
import {GuaranteeDeliveryManager} from "../../shared/GuaranteeDelivery";
import {updateSentryUser, captureMessage} from "../../shared/sentry";

const sortAndFilterFeeds = (feeds) => feeds
  .filter(feed => !feed.display.role.match(/^(ghost|guest)$/))
  .sort((a, b) => a.display.timestamp - b.display.timestamp);

const userFeeds = (feeds) => feeds.filter(feed => feed.display.role === 'user');

const PAGE_SIZE = 3;

class MobileClient extends Component {

    state = {
        delay: true,
        media: {
            audio:{
                context: null,
                audio_device: null,
                devices: [],
                error: null,
                stream: null,
            },
            video:{
                setting: { width: 320, height: 180, ideal: 15 },
                video_device: null,
                devices: [],
                error: null,
                stream: null,
            },
        },
        audio: null,
        video: null,
        janus: null,
        feeds: [],
        streamsMids: new Map(),
        creatingFeed: false,
        switchToPage: -1,
        page: 0,
        muteOtherCams: false,
        videos: Number(localStorage.getItem('vrt_video')) || 1,
        rooms: [],
        room: '',
        selected_room: parseInt(localStorage.getItem("room"), 10) || "",
        videoroom: null,
        remoteFeed: null,
        myid: null,
        mypvtid: null,
        localVideoTrack: null,
        localAudioTrack: null,
        muted: false,
        cammuted: false,
        protocol: null,
        user: null,
        visible: false,
        question: false,
        tested: false,
        support: false,
        card: 0,
        monitoringData: new MonitoringData(),
        connectionStatus: '',
        appInitError: null,
        net_status: 1,
        keepalive: null,
        shidur: false,
        shidurLoading: false,
        virtualStreamingJanus: new VirtualStreamingJanus(() => this.shidurInitialized()),
        shidurMuted: false,
        talking: false,
        chatMessagesCount: 0,
        chatVisible: false,
        settingsActiveIndex: -1,
        gdm: null,
        premodStatus: false,
    };

    shidurInitialized() {
      this.setState({shidurLoading: false});
    }

    setShidurMuted(muted) {
      if (muted) {
        this.state.virtualStreamingJanus.muteAudioElement();
      } else {
        this.state.virtualStreamingJanus.unmuteAudioElement();
      }
      this.setState({shidurMuted: muted});
    }

    componentDidUpdate(prevProps, prevState) {
      const {room, shidur, shidurLoading, shidurMuted} = this.state;
      // We are in the room and shidur now enabled (not loading).
      if (!shidurMuted && shidur && !prevState.shidur && !shidurLoading && room) {
        this.setShidurMuted(false);
      }
      // We are in the room shidur is on and shidur finished loading.
      if (!shidurMuted && !shidurLoading && prevState.shidurLoading && shidur && room) {
        this.setShidurMuted(false);
      }
      if (this.state.videoroom !== prevState.videoroom ||
          this.state.localVideoTrack !== prevState.localVideoTrack ||
          this.state.localAudioTrack !== prevState.localAudioTrack ||
          JSON.stringify(this.state.user) !== JSON.stringify(prevState.user)) {
        this.state.monitoringData.setConnection(
          this.state.videoroom,
          this.state.localAudioTrack,
          this.state.localVideoTrack,
          this.state.user,
          this.state.virtualStreamingJanus);
        this.state.monitoringData.setOnStatus((connectionStatus, connectionStatusMessage) => {
          if (this.state.connectionStatus !== connectionStatus) {
            this.setState({connectionStatus});
          }
        });
      }
    };

    checkPermission = (user) => {
        let pending_approval = kc.hasRealmRole("pending_approval");
        let gxy_user = kc.hasRealmRole("gxy_user");
        user.role = pending_approval ? 'ghost' : 'user';
        if (gxy_user || pending_approval) {
            this.initApp(user);
        } else {
            alert("Access denied!");
            kc.logout();
            updateSentryUser(null);
        }
    }

    componentDidMount() {
        if(!isMobile && window.location.href.indexOf("userm") > -1) {
            window.location = '/user/';
            return;
        }
        this.state.virtualStreamingJanus.onTalking((talking) => this.setState({talking}));
    };

    componentWillUnmount() {
      this.state.virtualStreamingJanus.destroy();
    }

    initApp = (user) => {
        let gdm = new GuaranteeDeliveryManager(user.id);
        this.setState({gdm});
        localStorage.setItem('question', false);
        localStorage.setItem('sound_test', false);
        localStorage.setItem('uuid', user.id);
        checkNotification();
        let system  = navigator.userAgent;
        user.system = system;
        let browser = platform.parse(system);
        if (!/Safari/.test(browser.name) && browser.os.family === "iOS") {
            alert("Only Safari browser supported on iOS system");
            return
        }

        if (!/Chrome/.test(browser.name) && browser.os.family === "Android") {
            alert("Only Chrome browser supported on Android system");
            return
        }

        geoInfo(`${GEO_IP_INFO}`, data => {
            user.ip = data && data.ip ? data.ip : '127.0.0.1';
            user.country = data && data.country ? data.country : 'XX';
            this.setState({user});
            updateSentryUser(user);

            api.fetchConfig()
                .then(data => {
                    ConfigStore.setGlobalConfig(data);
                    this.setState({premodStatus: ConfigStore.dynamicConfig(ConfigStore.PRE_MODERATION_KEY) === 'true'});
                    GxyJanus.setGlobalConfig(data);
                })
                .then(() => (api.fetchAvailableRooms({with_num_users: true})))
                .then(data => {
                    const {rooms} = data;
                    this.setState({rooms});
                    this.initDevices();
                    const {selected_room} = this.state;
                    if (selected_room !== "") {
                        const room = rooms.find(r => r.room === selected_room);
                        if (room) {
                            user.room = selected_room;
                            user.janus = room.janus;
                            user.group = room.description;
                            this.setState({delay: false, user});
                            updateSentryUser(user);
                        } else {
                            this.setState({selected_room: "", delay: false});
                        }
                    } else {
                        this.setState({delay: false});
                    }
                })
                .catch(err => {
                    console.error("[MobileClient] error initializing app", err);
                    this.setState({appInitError: err});
                });
        });
    };

    initClient = (reconnect, retry = 0) => {
      this.setState({delay: true});
      const user = Object.assign({}, this.state.user);
      const {t} = this.props;
      if(this.state.janus) {
        this.state.janus.destroy();
      }

      const config = GxyJanus.instanceConfig(user.janus);
      initJanus(janus => {
          // Check if unified plan supported
          if (Janus.unifiedPlan) {
            user.session = janus.getSessionId();
            this.setState({janus});
            this.initVideoRoom(reconnect, user);
          } else {
            alert(t('oldClient.unifiedPlanNotSupported'));
          }
      }, err => {
          this.exitRoom(false, () => {
              console.error("Disconnected duo: ", err);
              alert("Lost connection to the server!");
          });
          // FIXME: reconnect does not work as expected
          // this.exitRoom(true, () => {
          //     console.error("[VirtualClient] error initializing janus", err);
          //     this.reinitClient(retry);
          // });
      }, config.url, config.token, config.iceServers);
    };

    reinitClient = (retry) => {
        retry++;
        console.error("[VirtualClient] reinitializing try: ", retry);
        if(retry < 10) {
            setTimeout(() => {
                this.initClient(true, retry);
            }, 5000)
        } else {
            this.exitRoom(false, () => {
                console.error("[VirtualClient] reinitializing failed after: " + retry + " retries");
                alert("Lost connection to the server!");
            });
        }
    };

    initDevices = () => {
        getMedia(this.state.media)
            .then(media => {
                const {audio,video} = media;

                if(audio.error && video.error) {
                    alert('No input devices detected');
                    this.setState({cammuted: true});
                } else if(audio.error) {
                    alert(audio.error);
                } else if(video.error) {
                    alert(video.error);
                    this.setState({cammuted: true});
                }

                if(video.stream) {
                    let myvideo = this.refs.localVideo;
                    if(myvideo)
                        myvideo.srcObject = media.video.stream;
                }

                if(audio.stream) {
                    micLevel(audio.stream, this.refs.canvas1, audioContext => {
                        audio.context = audioContext;
                        this.setState({media})
                    });
                }

                this.setState({media})
            });
    };

    setVideoSize = (video_setting) => {
        let {media} = this.state;
        if(JSON.stringify(video_setting) === JSON.stringify(media.video.setting))
            return
        getMediaStream(false, true, video_setting,null, media.video.video_device)
            .then(data => {
                const [stream, error] = data;
                if(error) {
                    console.error(error)
                } else {
                    localStorage.setItem("video_setting", JSON.stringify(video_setting));
                    media.video.stream = stream;
                    media.video.setting = video_setting;
                    let myvideo = this.refs.localVideo;
                    myvideo.srcObject = stream;
                    this.setState({media});
                }
            })
    };

    setVideoDevice = (video_device) => {
        let {media} = this.state;
        if(video_device === media.video.video_device)
            return
        getMediaStream(false, true, media.video.setting,null,video_device)
            .then(data => {
                const [stream, error] = data;
                if(error) {
                    console.error(error)
                } else {
                    localStorage.setItem("video_device", video_device);
                    media.video.stream = stream;
                    media.video.video_device = video_device;
                    let myvideo = this.refs.localVideo;
                    myvideo.srcObject = stream;
                    this.setState({media});
                }
            })
    };

    setAudioDevice = (audio_device) => {
        let {media} = this.state;
        if(audio_device === media.audio.audio_device)
            return
        getMediaStream(true, false, media.video.setting, audio_device,null)
            .then(data => {
                const [stream, error] = data;
                if(error) {
                    console.error(error)
                } else {
                    localStorage.setItem("audio_device", audio_device);
                    media.audio.stream = stream;
                    media.audio.audio_device = audio_device;
                    if (media.audio.context) {
                        media.audio.context.close()
                    }
                    micLevel(stream, this.refs.canvas1, audioContext => {
                        media.audio.context = audioContext;
                        this.setState({media});
                    });
                }
            })
    };

    selectRoom = (selected_room) => {
        const {rooms} = this.state;
        const user = Object.assign({}, this.state.user);
        const room = rooms.find(r => r.room === selected_room);
        const name = room.description;
        if (this.state.room === selected_room) {
            return;
        }
        localStorage.setItem('room', selected_room);
        user.room = selected_room;
        user.group = name;
        user.janus = room.janus;
        this.setState({selected_room, user});
        updateSentryUser(user);
    };

    iceState = () => {
        let {user: {system}} = this.state;
        let browser = platform.parse(system);
        let count = 0;
        let chk = setInterval(() => {
            count++;
            console.debug("ICE counter: ", count);
            let {ice} = this.state;
            if (count < 60 && ice.match(/^(connected|completed)$/)) {
                clearInterval(chk);
            }
            if (browser.name.match(/^(Safari|Firefox)$/) && count === 10) {
                // console.log(" :: ICE Restart :: ");
                // this.iceRestart();
            }
            if (browser.name === "Chrome" && count === 30) {
                // console.log(" :: ICE Restart :: ");
                // this.iceRestart();
            }
            if (count >= 60) {
                clearInterval(chk);
                console.debug(" :: ICE Filed: Reconnecting... ");
                this.exitRoom(false);
                // FIXME: reconnect does not work as expected
                // this.exitRoom(true, () => {
                //     console.error("ICE Disconnected");
                //     this.initClient(true);
                // });
            }
        }, 1000);
    };

    mediaState = (media) => {
        // Handle video
        if(media === "video") {
            let count = 0;
            let chk = setInterval(() => {
                count++;
                let {video,ice} = this.state;

                // Video is back stop counter
                if(count < 11 && video) {
                    clearInterval(chk);
                }

                // Network problem handled in iceState
                if(count < 11 && ice === "disconnected") {
                    clearInterval(chk);
                }

                // Video still not back disconnecting
                if(count >= 10) {
                    clearInterval(chk);
                    alert("Server stopped receiving our media! Check your video device.");
                }
            }, 3000);
        }

        //Handle audio
        if(media === "audio") {
            let count = 0;
            let chk = setInterval(() => {
                count++;
                let {audio,video,ice,question} = this.state;

                // Audio is back stop counter
                if(count < 11 && audio) {
                    clearInterval(chk);
                }

                // Network problem handled in iceState
                if(count < 11 && ice === "disconnected") {
                    clearInterval(chk);
                }

                // The problem with both devices, leave resolve it in video loop
                if(count < 11 && !audio && !video) {
                    clearInterval(chk);
                }

                // Audio still not back
                if(count >= 10 && !audio && video) {
                    clearInterval(chk);
                    if(question)
                        this.handleQuestion();
                    alert("Server stopped receiving our Audio! Check your Mic");
                }
            }, 3000);
        }
    };

    initVideoRoom = (reconnect, user) => {
        this.state.janus.attach({
            plugin: "janus.plugin.videoroom",
            opaqueId: "videoroom_user",
            success: (videoroom) => {
                Janus.log(' :: My handle: ', videoroom);
                Janus.log('Plugin attached! (' + videoroom.getPlugin() + ', id=' + videoroom.getId() + ')');
                Janus.log('  -- This is a publisher/manager');
                user.handle = videoroom.getId();  // User state updated in this.joinRoom.
                this.setState({videoroom});
                this.joinRoom(reconnect, videoroom, user);
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            consentDialog: (on) => {
                Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
            },
            iceState: (state) => {
                Janus.log("ICE state changed to " + state);
                this.setState({ice: state});
                if(state === "disconnected") {
                    // FIXME: ICE restart does not work properly, so we will do silent reconnect
                    this.iceState();
                }
            },
            mediaState: (media, on) => {
                Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + media);
                this.setState({[media]: on});
                if(!on) {
                    this.mediaState(media);
                }
            },
            webrtcState: (on) => {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            slowLink: (uplink, lost, mid) => {
                Janus.log("Janus reports problems " + (uplink ? "sending" : "receiving") +
                    " packets on mid " + mid + " (" + lost + " lost packets)");
            },
            onmessage: (msg, jsep) => {
                this.onMessage(this.state.videoroom, msg, jsep, false);
            },
            onlocaltrack: (track, on) => {
              Janus.log(" ::: Got a local track event :::");
              Janus.log("Local track " + (on ? "added" : "removed") + ":", track);
              let {videoroom} = this.state;
              videoroom.muteAudio();
              if (on && track && track.kind === 'video') {
                  let stream = new MediaStream();
                  stream.addTrack(track.clone());
                  let myvideo = this.refs.localVideo;
                  Janus.attachMediaStream(myvideo, stream);
                this.setState({localVideoTrack: track});
              }
              if (on && track && track.kind === 'audio') {
                this.setState({localAudioTrack: track});
              }
            },
            onremotestream: (stream) => {
                // The publisher stream is sendonly, we don't expect anything here
            },
            ondataopen: (label) => {
                Janus.log("Publisher - DataChannel is available! ("+label+")");
            },
            ondata: (data, label) => {
                Janus.log("Publisher - Got data from the DataChannel! ("+label+")" + data);
            },
            ondataerror: (error) => {
                Janus.warn('Publisher - DataChannel error: ' + error);
            },
            oncleanup: () => {
                Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
            }
        });
    };

    joinRoom = (reconnect, videoroom, user) => {
        let {janus, selected_room, media} = this.state;
        const {video: {video_device}} = media;
        user.question = false;
        user.camera = !!video_device;
        user.timestamp = Date.now();
        this.setState({user, muted: true});
        updateSentryUser(user);

        this.chat.initChatRoom(janus, selected_room, user, data => {
            const { textroom, error_code, error } = data;
            if (textroom === 'error') {
                console.error("Chatroom error: ", data, error_code)
                captureMessage(`Chatroom error: init - ${error}`, {source: "Textroom", err: data}, 'error');
                this.exitRoom(false, () => {
                    if(error_code === 420)
                        alert(this.props.t('oldClient.error') + data.error);
                }, true);
            } else if(textroom === "success" && data.participants) {
                Janus.log(":: Successfully joined to chat room: " + selected_room );
                const {id, timestamp, role, username} = user;
                const d = {id, timestamp, role, display: username};
                const register = {'request': 'join', 'room': selected_room, 'ptype': 'publisher', 'display': JSON.stringify(d)};
                videoroom.send({
                    "message": register,
                    success: () => {
                        console.log(" Request join success");
                    },
                    error: (error) => {
                        console.error(error);
                        this.exitRoom(false);
                    }
                })
            }
        });
    };

    exitRoom = (reconnect, callback, error) => {
        this.setState({delay: true})
        let {videoroom, remoteFeed, protocol, janus, room} = this.state;
        wkliLeave(this.state.user);
        clearInterval(this.state.upval);
        this.clearKeepAlive();

        if(remoteFeed) remoteFeed.detach();
        if(videoroom) videoroom.send({"message": {request: 'leave', room}});
        let pl = {textroom: 'leave', transaction: Janus.randomString(12), 'room': PROTOCOL_ROOM};
        if(protocol) protocol.data({text: JSON.stringify(pl)});

        localStorage.setItem('question', false);

        api.fetchAvailableRooms({with_num_users: true})
            .then(data => {
                const {rooms} = data;
                this.setState({rooms});
            });

        if (this.chat && !error) {
            this.chat.exitChatRoom(room);
        }

        if (this.state.shidur) {
            this.toggleShidur();
        }

        setTimeout(() => {
            if(videoroom) videoroom.detach();
            if(protocol) protocol.detach();
            if(janus) janus.destroy();
            this.setState({
                cammuted: false, muted: false, question: false,
                feeds: [], /*mids: [], showed_mids:[],*/
                localAudioTrack: null, localVideoTrack: null, upval: null,
                remoteFeed: null, videoroom: null, protocol: null, janus: null,
                delay: reconnect,
                room: reconnect ? room : '',
                chatMessagesCount: 0,
            });
            if(typeof callback === "function") callback();
        }, 2000);
    };

    publishOwnFeed = (useVideo, useAudio) => {
      console.log('publishOwnFeed');
      const {videoroom, media} = this.state;
      const {audio: {audio_device}, video: {setting,video_device}} = media;
      const offer = {audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: useVideo, data: false};

      if(useVideo) {
          const {width,height,ideal} = setting;
          offer.video = {width, height, frameRate: {ideal, min: 1}, deviceId: {exact: video_device}};
      }

      if(useAudio) {
          offer.audio = {deviceId: {exact: audio_device}};
      }

      videoroom.createOffer({
          media: offer,
          simulcast: false,
          success: (jsep) => {
            console.log('publishOwnFeed createOffer success!');
            Janus.debug("Got publisher SDP!");
            Janus.debug(jsep);
            const publish = { request: "configure", audio: useAudio, video: useVideo, data: false };
            videoroom.send({"message": publish, "jsep": jsep});
          },
          error: (error) => {
            Janus.error("WebRTC error:", error);
            if (useVideo) {
                this.publishOwnFeed(false);
            } else {
                Janus.error("WebRTC error... " + JSON.stringify(error));
            }
          }
      });
    };

    iceRestart = () => {
        const {videoroom, remoteFeed} = this.state;

        if(videoroom) {
            videoroom.createOffer({
                media: { audioRecv: false, videoRecv: false, audioSend: true, videoSend: true },
                iceRestart: true,
                simulcast: false,
                success: (jsep) => {
                    Janus.debug('Got publisher SDP!');
                    Janus.debug(jsep);
                    const publish = { request: 'configure', restart: true };
                    videoroom.send({ 'message': publish, 'jsep': jsep });
                },
                error: (error) => {
                    Janus.error('WebRTC error:', error);
                }
            });
        }

        if(remoteFeed) remoteFeed.send({message: {request: "configure", restart: true}});
        if(this.chat) this.chat.iceRestart();
        if(this.state.virtualStreamingJanus) this.state.virtualStreamingJanus.iceRestart();

        captureMessage("ICE Restart", {source: "icestate"});
    };

    onMessage = (videoroom, msg, jsep) => {
        Janus.log(" ::: Got a message (publisher) :::");
        Janus.log(msg);
        let event = msg["videoroom"];
        if(event !== undefined && event !== null) {
            if(event === "joined") {
                const user = Object.assign({}, this.state.user);
                let myid = msg["id"];
                let mypvtid = msg["private_id"];
                Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);

                user.rfid = myid;
                this.setState({user, myid, mypvtid, room: msg['room'], delay: false});
                updateSentryUser(user);

                api.updateUser(user.id, user)
                    .catch(err => console.error("[User] error updating user state", user.id, err));
                this.keepAlive();

                const {media: {audio: {audio_device}, video: {video_device}}} = this.state;
                this.publishOwnFeed(!!video_device, !!audio_device);

                // Any new feed to attach to?
                if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                  //FIXME: display property is JSON write now, let parse it in one place
                  const feeds = sortAndFilterFeeds(
                    msg['publishers'].filter(l => l.display = (JSON.parse(l.display))));
                  Janus.log(':: Got Publishers list: ', msg['publishers'], feeds);

                  // Feeds count with user role
                  const feedsCount = userFeeds(feeds).length;
                  if (feedsCount > 25) {
                    alert(`Max users in this room is reached (${feedsCount}).`);
                    this.exitRoom(false);
                    return;
                  }

                  this.makeSubscription(feeds, /* feedsJustJoined= */ false,
                                        /* subscribeToVideo= */ false,
                                        /* subscribeToAudio= */ !isGhostOrGuest(user.role), /* subscribeToData= */ true);
                  this.switchVideos(/* page= */ this.state.page, [], userFeeds(feeds));
                  this.setState({feeds});
                }
            } else if(event === 'talking') {
              const feeds = Object.assign([], this.state.feeds);
              const id = msg['id'];
              Janus.log(`User: ${id} - start talking`);
              const feed = feeds.find(feed => feed.id === id);
              if (!feed) {
                Janus.error(`Did not find user ${id}.`);
                return;
              }
              feed.talking = true;
              this.setState({feeds});
            } else if(event === 'stopped-talking') {
              const feeds = Object.assign([], this.state.feeds);
              const id = msg['id'];
              Janus.log(`User: ${id} - stop talking`);
              const feed = feeds.find(feed => feed.id === id);
              if (!feed) {
                Janus.error(`Did not find user ${id}.`);
                return;
              }
              feed.talking = false;
              this.setState({feeds});
            } else if(event === "destroyed") {
                // The room has been destroyed
                Janus.warn("The room has been destroyed!");
            } else if(event === "event") {
                if (msg['configured'] === 'ok') {
                  // User published own feed successfully.
                  if (this.state.muteOtherCams) {
                    this.camMute(/* cammuted= */ false);
                    this.setState({videos: NO_VIDEO_OPTION_VALUE});
                    this.state.virtualStreamingJanus.setVideo(NO_VIDEO_OPTION_VALUE);
                  }
                } else if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                  // User just joined the room.
                  const newFeeds = sortAndFilterFeeds(msg['publishers'].filter(l => l.display = (JSON.parse(l.display))));
                  Janus.debug('New list of available publishers/feeds:', newFeeds);
                  const newFeedsIds = new Set(newFeeds.map(feed => feed.id));
                  const {feeds, user: {role}} = this.state;
                  if (feeds.some(feed => newFeedsIds.has(feed.id))) {
                    Janus.error(`New feed joining but one of the feeds already exist`, newFeeds, feeds);
                    return;
                  }
                  // Merge new feed with existing feeds and sort.
                  const feedsNewState = sortAndFilterFeeds([...newFeeds, ...feeds]);
                  this.makeSubscription(newFeeds, /* feedsJustJoined= */ true,
                                        /* subscribeToVideo= */ false,
                                        /* subscribeToAudio= */ isGhostOrGuest(role), /* subscribeToData= */ true);
                  this.switchVideos(/* page= */ this.state.page, userFeeds(feeds), userFeeds(feedsNewState));
                  this.setState({feeds: feedsNewState});

                } else if(msg["leaving"] !== undefined && msg["leaving"] !== null) {
                  // User leaving the room which is same as publishers gone.
                  const leaving = msg['leaving'];
                  Janus.log('Publisher leaving: ', leaving);
                  const {feeds} = this.state;
                  this.unsubscribeFrom([leaving], /* onlyVideo= */ false);
                  const feedsNewState = feeds.filter(feed => feed.id !== leaving);
                  this.switchVideos(/* page= */ this.state.page, userFeeds(feeds), userFeeds(feedsNewState));
                  this.setState({feeds: feedsNewState});

                } else if(msg['unpublished'] !== undefined && msg['unpublished'] !== null) {
                    const unpublished = msg['unpublished'];
                    Janus.log('Publisher unpublished: ', unpublished);
                    if(unpublished === 'ok') {
                        // That's us
                        videoroom.hangup();
                        return;
                    }

                } else if(msg["error"] !== undefined && msg["error"] !== null) {
                    if(msg["error_code"] === 426) {
                        Janus.log("This is a no such room");
                    } else {
                        Janus.log(msg["error"]);
                    }
                }
            }
        }
        if(jsep !== undefined && jsep !== null) {
            Janus.debug("Handling SDP as well...");
            Janus.debug(jsep);
            videoroom.handleRemoteJsep({jsep: jsep});
        }
    };

    newRemoteFeed = (subscription) => {
        this.state.janus.attach(
            {
                plugin: "janus.plugin.videoroom",
                opaqueId: "remotefeed_user",
                success: (pluginHandle) => {
                    let remoteFeed = pluginHandle;
                    Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                    Janus.log("  -- This is a multistream subscriber",remoteFeed);
                    this.setState({remoteFeed, creatingFeed: false});
                    // We wait for the plugin to send us an offer
                    let subscribe = {request: "join", room: this.state.room, ptype: "subscriber", streams: subscription};
                    remoteFeed.send({ message: subscribe });
                },
                error: (error) => {
                    Janus.error("  -- Error attaching plugin...", error);
                },
                iceState: (state) => {
                    Janus.log("ICE state (remote feed) changed to " + state);
                },
                webrtcState: (on) => {
                    Janus.log("Janus says this WebRTC PeerConnection (remote feed) is " + (on ? "up" : "down") + " now");
                },
                slowLink: (uplink, nacks) => {
                    Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") +
                        " packets on this PeerConnection (remote feed, " + nacks + " NACKs/s " + (uplink ? "received" : "sent") + ")");
                },
                onmessage: (msg, jsep) => {
                    Janus.log(" ::: Got a message (subscriber) :::");
                    Janus.log(msg);
                    let event = msg["videoroom"];
                    Janus.log("Event: " + event);
                    if(msg["error"] !== undefined && msg["error"] !== null) {
                      Janus.debug("-- ERROR: " + msg["error"]);
                    } else if(event !== undefined && event !== null) {
                      if(event === "attached") {
                          this.setState({creatingFeed: false});
                          Janus.log("Successfully attached to feed in room " + msg["room"]);
                      } else if(event === "event") {
                          // Check if we got an event on a simulcast-related event from this publisher
                      } else {
                          // What has just happened?
                      }

                      if (event === 'attached' || (event === 'event' && msg['switched'] === 'ok') ||
                          event === 'updated') {
                        if (msg['streams']) {
                          // Update map of subscriptions by mid
                          const {streamsMids} = this.state;
                          const old = Array.from(streamsMids.entries());
                          const newStreamsMids = new Map(msg['streams'].map(stream => [stream.mid, stream.feed_id]));
                          this.setState({streamsMids: newStreamsMids});
                        }
                      }
                    }

                    if(jsep !== undefined && jsep !== null) {
                        const {remoteFeed} = this.state;
                        Janus.debug("Handling SDP as well...");
                        Janus.debug(jsep);
                        // Answer and attach
                        remoteFeed.createAnswer(
                            {
                                jsep: jsep,
                                // Add data:true here if you want to subscribe to datachannels as well
                                // (obviously only works if the publisher offered them in the first place)
                                media: { audioSend: false, videoSend: false, data: false },	// We want recvonly audio/video
                                success: (jsep) => {
                                    Janus.debug("Got SDP!");
                                    Janus.debug(jsep);
                                    let body = { request: "start", room: this.state.room };
                                    remoteFeed.send({ message: body, jsep: jsep });
                                },
                                error: (error) => {
                                    Janus.error("WebRTC error:", error);
                                    Janus.debug("WebRTC error... " + JSON.stringify(error));
                                }
                            });
                    }
                },
                onlocaltrack: (track, on) => {
                    // The subscriber stream is recvonly, we don't expect anything here
                },
                onremotetrack: (track, mid, on) => {
                  Janus.log(" ::: Got a remote track event ::: (remote feed)");
                  if(!mid) {
                    mid = track.id.split("janus")[1];
                  }
                  Janus.log("Remote track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
                  // Which publisher are we getting on this mid?
                  // let {mids,feedStreams} = this.state;
                  const {streamsMids, feeds} = this.state
                  if (!streamsMids.has(mid)) {
                    Janus.error('Got remote track, but it is not in mids', mid, Array.from(streamsMids.entries()));
                    return;
                  }
                  const feedId = streamsMids.get(mid);
                  const feed = feeds.find(feed => feed.id === feedId);
                  // Janus.log(" >> This track is coming from feed " + feed + ":", mid);
                  // If we're here, a new track was added
                  if(track.kind === "audio" && on) {
                      // New audio track: create a stream out of it, and use a hidden <audio> element
                      const stream = new MediaStream();
                      stream.addTrack(track.clone());
                      Janus.log("Created remote audio stream:", stream);
                      // feedStreams[feed].audio_stream = stream;
                      // this.setState({feedStreams});
                      const remoteAudio = this.refs["remoteAudio" + feedId];
                      Janus.attachMediaStream(remoteAudio, stream);
                  } else if(track.kind === "video" && on) {
                      // New video track: create a stream out of it
                      let stream = new MediaStream();
                      stream.addTrack(track.clone());
                      Janus.log("Created remote video stream:", stream);
                      const remotevideo = this.refs["remoteVideo" + feed.videoSlot];
                      Janus.log("Attach to slot: ", feed.videoSlot);
                      Janus.attachMediaStream(remotevideo, stream);
                  } else if(track.kind === "data") {
                      Janus.log("Created remote data channel");
                  } else {
                      Janus.log("-- Already active stream --");
                  }
                },
                ondataopen: (label) => {
                    Janus.log("Feed - DataChannel is available! ("+label+")");
                },
                ondata: (data, label) => {
                    Janus.log("Feed - Got data from the DataChannel! ("+label+")" + data);
                },
                ondataerror: (error) => {
                    Janus.warn('Feed - DataChannel error: ' + error);
                },
                oncleanup: () => {
                    Janus.log(" ::: Got a cleanup notification (remote feed) :::");
                }
            });
    };


    // Subscribe to feeds, whether already existing in the room, when I joined
    // or new feeds that join the room when I'm already in. In both cases I
    // should add those feeds to my feeds list.
    // In case of feeds just joined and |question| is set, we should notify the
    // new entering user by notifying everyone.
    // Subscribes selectively to different stream types |subscribeToVideo|, |subscribeToAudio|, |subscribeToData|.
    // This is required to stop and then start only the videos to save bandwidth.
    makeSubscription = (newFeeds, feedsJustJoined, subscribeToVideo, subscribeToAudio, subscribeToData) => {
        const subscription = [];
        newFeeds.forEach((feed, feedIndex) => {
            const {id, streams} = feed;
            feed.video = !!streams.find(v => v.type === 'video' && v.codec === "h264");
            feed.audio = !!streams.find(a => a.type === 'audio' && a.codec === "opus");
            feed.data = !!streams.find(d => d.type === 'data');
            feed.cammute = !feed.video;

            streams.forEach(stream => {
                if ((subscribeToVideo && stream.type === "video" && stream.codec === "h264") ||
                    (subscribeToAudio && stream.type === "audio" && stream.codec === "opus") ||
                    (subscribeToData && stream.type === "data")) {
                    subscription.push({feed: id, mid: stream.mid});
                }
            });
        });

        if (subscription.length > 0) {
            this.subscribeTo(subscription);
            if(feedsJustJoined) {
                // Send question event for new feed, by notifying the whole room.
                // FIXME: Can this be done by notifying only the joined feed?
                setTimeout(() => {
                    if (this.state.question) {
                        const msg = {type: "client-state", user: this.state.user};
                        this.chat.sendCmdMessage(msg);
                    }
                }, 3000);
            }
        }
    };

    subscribeTo = (subscription) => {
        // New feeds are available, do we need create a new plugin handle first?
        Janus.log(" :: Got subscribtion: ", subscription, !!this.state.remoteFeed, this.state.creatingFeed);
        if (this.state.remoteFeed) {
            this.state.remoteFeed.send({message:
                    {request: "subscribe", streams: subscription}
            });
            return;
        }

        // We don't have a handle yet, but we may be creating one already
        if (this.state.creatingFeed) {
            // Still working on the handle
            setTimeout(() => {
                this.subscribeTo(subscription);
            }, 500);
            return;
        }

        // We are not creating the feed, so let's do it.
        this.setState({creatingFeed: true});
        this.newRemoteFeed(subscription);
    };

    // Unsubscribe from feeds defined by |ids| (with all streams) and remove it when |onlyVideo| is false.
    // If |onlyVideo| is true, will unsubscribe only from video stream of those specific feeds, keeping those feeds.
    unsubscribeFrom = (ids, onlyVideo) => {
      const {feeds/*, feedStreams, index*/} = this.state;
      const idsSet = new Set(ids);
      const unsubscribe = {request: 'unsubscribe', streams: []};
      feeds.filter(feed => idsSet.has(feed.id)).forEach(feed => {
        if (onlyVideo) {
          // Unsubscribe only from one video stream (not all publisher feed).
          // Acutally expecting only one video stream, but writing more generic code.
          feed.streams.filter(stream => stream.type === 'video')
            .map(stream => ({feed: feed.id, mid: stream.mid}))
            .forEach(stream => unsubscribe.streams.push(stream));
        } else {
          // Unsubscribe the whole feed (all it's streams).
          unsubscribe.streams.push({ feed: feed.id });
          Janus.log('Unsubscribe from Feed ' + JSON.stringify(feed) + ' (' + feed.id + ').');
        }
      });
      // Send an unsubscribe request.
      const {remoteFeed} = this.state;
      if (remoteFeed !== null && unsubscribe.streams.length > 0) {
        remoteFeed.send({ message: unsubscribe });
      }
    };

    userState = (user) => {
        const feeds = Object.assign([], this.state.feeds);
        const {camera, question, rfid} = user;

        for (let i = 0; i < feeds.length; i++) {
            if (feeds[i] && feeds[i].id === rfid) {
                feeds[i].cammute = !camera;
                feeds[i].question = question;
                this.setState({feeds});
                break;
            }
        }
    };

    switchVideoSlots = (from, to) => {
      const fromRemoteVideo = this.refs["remoteVideo" + from];
      const toRemoteVideo = this.refs["remoteVideo" + to];
      const stream = fromRemoteVideo.srcObject;
      Janus.log(`Switching stream from ${from} to ${to}`, stream, fromRemoteVideo, toRemoteVideo);
      Janus.attachMediaStream(toRemoteVideo, stream);
      Janus.attachMediaStream(fromRemoteVideo, null);
    }

    switchVideos = (page, oldFeeds, newFeeds) => {
      const {muteOtherCams} = this.state;

      const oldVideoSlots = [
        oldFeeds.findIndex(feed => feed.videoSlot === 0),
        oldFeeds.findIndex(feed => feed.videoSlot === 1),
        oldFeeds.findIndex(feed => feed.videoSlot === 2),
      ];
      const oldVideoFeeds = oldVideoSlots.map(index => index !== -1 ? oldFeeds[index] : null);

      const newVideoSlots = [
        (page * PAGE_SIZE) + 0 >= newFeeds.length ? -1 : (page * PAGE_SIZE) + 0,
        (page * PAGE_SIZE) + 1 >= newFeeds.length ? -1 : (page * PAGE_SIZE) + 1,
        (page * PAGE_SIZE) + 2 >= newFeeds.length ? -1 : (page * PAGE_SIZE) + 2,
      ];
      const newVideoFeeds = newVideoSlots.map(index => index !== -1 ? newFeeds[index] : null);

      // Update video slots.
      oldVideoFeeds.forEach((feed) => {
        if (feed !== null) {
          delete feed.videoSlot;
        }
      });
      newVideoFeeds.forEach((feed, newIndex) => {
        if (feed !== null) {
          feed.videoSlot = newIndex;
        }
      });

      // Cases:
      // old: [0, 1, 2] [f0, f1, f2], new: [3, 4, 5] [f3, f4, f5]                  Simple next page switch.
      // old: [3, 4, 5] [f3, f4, f5], new: [0, 1, 2] [f0, f1, f2]                  Simple prev page switch.
      // old: [-1, -1, -1] [null, null, null], new: [0, -1, -1] [f0, null, null]   First user joins.
      // old: [0, -1, -1] [f0, null, null], new: [0, 1, -1] [f0, f1, null]         Second user joins.
      // old: [3, 4, 5] [f3, f4, f5], new: [3, 4, 5] [f3, f5, f6]                  User f4 left.
      // old: [3, 4, 5] [f3, f4, f5], new: [3, 4, 5] [f3, fX, f4]                  User fX joins.

      const subscribeFeeds = [];
      const unsubscribeFeeds = [];
      const switchFeeds = [];
      newVideoFeeds.forEach(newFeed => {
        if (newFeed !== null && !oldVideoFeeds.find(oldFeed => oldFeed !== null && oldFeed.id === newFeed.id)) {
          subscribeFeeds.push(newFeed);
        }
      });
      oldVideoFeeds.forEach(oldFeed => {
        if (oldFeed !== null && !newVideoFeeds.find(newFeed => newFeed !== null && newFeed.id === oldFeed.id)) {
          unsubscribeFeeds.push(oldFeed);
        }
      });
      oldVideoFeeds.forEach((oldFeed, oldIndex) => {
        if (oldFeed !== null) {
          const newIndex = newVideoFeeds.findIndex(newFeed => newFeed !== null && newFeed.id === oldFeed.id);
          if (newIndex !== -1 && oldIndex !== newIndex) {
            switchFeeds.push({from: oldVideoSlots[oldIndex], to: newVideoSlots[newIndex]});
          }
        }
      })

      if (!muteOtherCams) {
        this.makeSubscription(subscribeFeeds, /* feedsJustJoined= */ false, /* subscribeToVideo= */ true,
                              /* subscribeToAudio= */ false, /* subscribeToData= */ false);
        this.unsubscribeFrom(unsubscribeFeeds.map(feed => feed.id), /* onlyVideo= */ true);
        switchFeeds.forEach(({from, to}) => this.switchVideoSlots(from, to));
      } else {
        console.log('Ignoring subscribe/unsubscribe/switch, we are at mute other cams mode.');
      }
    }

    handleCmdData = (data) => {
        const {user, cammuted} = this.state;
        const {type,id} = data;
        if (type === 'client-reconnect' && user.id === id) {
            this.exitRoom(true, () => {
                this.initClient(true);
            });
        } else if (type === 'client-reload' && user.id === id) {
            window.location.reload();
        } else if (type === 'client-disconnect' && user.id === id) {
            this.exitRoom(false);
        } else if(type === "client-kicked" && user.id === id) {
            kc.logout();
            updateSentryUser(null);
        } else if (type === 'client-question' && user.id === id) {
            this.handleQuestion();
        } else if (type === 'client-mute' && user.id === id) {
            this.micMute();
        } else if (type === 'video-mute' && user.id === id) {
            this.camMute(cammuted);
        } else if (type === 'sound_test' && user.id === id) {
            user.sound_test = true;
            localStorage.setItem('sound_test', true);
            this.setState({user});
            updateSentryUser(user);
        } else if (type === 'audio-out') {
            this.handleAudioOut(data);
        }  else if (type === 'reload-config') {
            this.reloadConfig();
        } else if (type === 'client-reload-all') {
            window.location.reload();
        } else if (type === 'client-state') {
            this.userState(data.user);
        }
    };

    keepAlive = () => {
        // send every 2 seconds
        this.setState({keepalive: setInterval(this.sendKeepAlive, 2*1000)});

        // after 20 seconds, increase interval from 2 to 30 seconds.
        setTimeout(() => {
            this.clearKeepAlive();
            this.setState({keepalive: setInterval(this.sendKeepAlive, 30*1000)});
        }, 20*1000);
    };

    sendKeepAlive = () => {
        const {user, janus} = this.state;
        if (user && janus && janus.isConnected() && user.session && user.handle) {
            api.updateUser(user.id, user)
                .then(data => {
                    if (ConfigStore.isNewer(data.config_last_modified)) {
                        console.info("[User] there is a newer config. Reloading ", data.config_last_modified);
                        this.reloadConfig();
                    }
                })
                .catch(err => console.error("[User] error sending keepalive", user.id, err));
        }
    };

    clearKeepAlive = () => {
        const {keepalive} = this.state;
        if (keepalive) {
            clearInterval(keepalive);
        }
        this.setState({keepalive: null});
    }

    reloadConfig = () => {
        api.fetchConfig()
            .then((data) => {
                ConfigStore.setGlobalConfig(data);
                const {premodStatus, question} = this.state;
                const newPremodStatus = ConfigStore.dynamicConfig(ConfigStore.PRE_MODERATION_KEY) === 'true';
                if (newPremodStatus !== premodStatus) {
                    this.setState({premodStatus: newPremodStatus});
                    if(question) {
                        this.handleQuestion();
                    }
                }
            })
            .catch(err => {
                console.error("[User] error reloading config", err);
            });
    }

    makeDelay = () => {
        this.setState({delay: true});
        setTimeout(() => {
            this.setState({delay: false});
        }, 3000);
    };

    handleQuestion = () => {
        const {question} = this.state;
        const user = Object.assign({}, this.state.user);
        if(user.role === 'ghost') return;
        this.makeDelay();
        this.questionState(user, question);
    };

    questionState = (user, question) => {
        user.question = !question;
        api.updateUser(user.id, user)
            .then(data => {
                if(data.result === "success") {
                    localStorage.setItem('question', !question);
                    this.setState({user, question: !question});
                    updateSentryUser(user);
                    const msg = {type: "client-state", user};
                    this.chat.sendCmdMessage(msg);
                }
            })
            .catch(err => console.error("[User] error updating user state", user.id, err))
    };

    handleAudioOut = (data) => {
        const { gdm } = this.state;

        gdm.accept(data, (msg) => this.chat.sendCmdMessage(msg)).then((data) => {
            if (data === null) {
                console.log('Message received more then once.');
                return;
            }

            this.state.virtualStreamingJanus.streamGalaxy(data.status, 4, "");
            if (data.status) {
                // remove question mark when sndman unmute our room
                if (this.state.question) {
                    this.handleQuestion();
                }
            }

        }).catch((error) => {
            console.error(`Failed receiving ${data}: ${error}`);
        });
    };

    otherCamsMuteToggle = () => {
      const {feeds, muteOtherCams} = this.state;
      const activeFeeds = feeds.filter((feed) => feed.videoSlot !== undefined);
      if (!muteOtherCams) {
        // Should hide/mute now all videos.
        this.unsubscribeFrom(activeFeeds.map(feed => feed.id), /* onlyVideo= */ true);
        this.camMute(/* cammuted= */ false);
        this.setState({videos: NO_VIDEO_OPTION_VALUE});
        this.state.virtualStreamingJanus.setVideo(NO_VIDEO_OPTION_VALUE);
      } else {
        // Should unmute/show now all videos.false,
        this.makeSubscription(activeFeeds, /* feedsJustJoined= */ false, /* subscribeToVideo= */ true,
                              /* subscribeToAudio= */ false, /* subscribeToData= */ false);
        this.camMute(/* cammuted= */ true);
        this.setState({videos: VIDEO_240P_OPTION_VALUE});
        this.state.virtualStreamingJanus.setVideo(VIDEO_240P_OPTION_VALUE);
      }
      this.setState({muteOtherCams: !muteOtherCams});
    }

    camMute = (cammuted) => {
      let {videoroom} = this.state;
      if (videoroom) {
        const user = Object.assign({}, this.state.user);
        if (user.role === "ghost") return;
        this.makeDelay();
        user.camera = cammuted;
        api.updateUser(user.id, user)
            .then(data => {
                if(data.result === "success") {
                    cammuted ? videoroom.unmuteVideo() : videoroom.muteVideo();
                    this.setState({user, cammuted: !cammuted});
                    updateSentryUser(user);
                    const msg = {type: "client-state", user};
                    this.chat.sendCmdMessage(msg);
                }
            })
            .catch(err => console.error("[User] error updating user state", user.id, err))
      }
    };

    micMute = () => {
        let {videoroom, muted} = this.state;
        muted ? videoroom.unmuteAudio() : videoroom.muteAudio();
        this.setState({muted: !muted});
    };

    toggleShidur = () => {
      const {virtualStreamingJanus, shidur, user} = this.state;
      const stateUpdate = {shidur: !shidur};
      if (shidur) {
        virtualStreamingJanus.destroy();
      } else {
        const {ip, country} = user;
        virtualStreamingJanus.init(ip, country);
        stateUpdate.shidurLoading = true;
      }
      this.setState(stateUpdate);
    };

    onChatMessage = () => {
      this.setState({chatMessagesCount: this.state.chatMessagesCount + 1});
    };

    chatMount = () => {
      if (this.chatModal && this.chatWrapper && this.chatWrapper.firstChild) {
        this.chatModal.appendChild(this.chatWrapper.firstChild);
        this.setState({chatVisible: true, chatMessagesCount: 0});
      }
    }

    chatUnmount = () => {
      if (this.chatWrapper && this.chatModal && this.chatModal.firstChild) {
        this.chatWrapper.appendChild(this.chatModal.firstChild);
        this.setState({chatVisible: false});
      }
    }

    homerLimudCss = (ref) => {
      return;

      if (ref) {
        ref.onload = () => {
          var body = ref.contentWindow.document.querySelector('body');
          body.style.color = 'red';
          body.style.fontSize = '3rem';
          body.style.lineHeight = '3rem';
        }
      }
    }

    handleClick = (e, titleProps) => {
      const { index } = titleProps;
      const { settingsActiveIndex } = this.state;
      const newIndex = settingsActiveIndex === index ? -1 : index;

      this.setState({ settingsActiveIndex: newIndex })
    }

    switchPage = (page, feeds) => {
      // Normalize page, e.g., if it is -1 or too large...
      const onlyUserFeeds = userFeeds(feeds);
      const numPages = Math.ceil(onlyUserFeeds.length / PAGE_SIZE);
      page = numPages === 0 ? 0 : (numPages + page) % numPages;
      this.switchVideos(page, onlyUserFeeds, onlyUserFeeds);
      this.setState({page});
    }

    render() {
      const {t, i18n} = this.props;
      const {
        appInitError,
        audio,
        cammuted,
        chatMessagesCount,
        chatVisible,
        delay,
        janus,
        localAudioTrack,
        media,
        monitoringData,
        muteOtherCams,
        muted,
        myid,
        name,
        net_status,
        question,
        room,
        rooms,
        selected_room,
        settingsActiveIndex,
        shidur,
        virtualStreamingJanus,
        shidurLoading,
        talking,
        user,
        feeds,
        page,
        videos,
        premodStatus,
      } = this.state;
      const {video_device} = media.video;
      const {audio_device} = media.audio;

      if (appInitError) {
          return (
              <Fragment>
                  <h1>Error Initializing Application</h1>
                  {`${appInitError}`}
              </Fragment>
          );
      }

      const width = "134";
      const height = "100";
      const autoPlay = true;
      const controls = false;
      //const vmuted = true;

      //let iOS = ['iPad', 'iPhone', 'iPod'].indexOf(navigator.platform) >= 0;

      let rooms_list = rooms.map((data,i) => {
          const { room, description, num_users } = data;
          return ({ key: i, text: description, description: num_users, value: room });
      });

      let connectionIcon = () => {
        switch (this.state.connectionStatus) {
          case LINK_STATE_INIT:
            return connectionGray;
          case LINK_STATE_GOOD:
            return connectionWhite;
          case LINK_STATE_MEDIUM:
            return connectionOrange;
          case LINK_STATE_WEAK:
            return connectionRed;
          default:
            return connectionGray;
        }
      }

      // TODO: Instead of 0, 3 should actuaaly map things...
      const remoteVideos = userFeeds(feeds).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((feed, i) => {
        return (<div className="video"
                     key={"vk" + i}
                     ref={"video" + i}
                     id={"video" + i}>
            <div className={classNames('video__overlay', {'talk': feed.talking})}>
                {feed.question ? <div className="question">
                    <svg viewBox="0 0 50 50">
                        <text x="25" y="25" textAnchor="middle" alignmentBaseline="central"
                              dominantBaseline="central">&#xF128;</text>
                    </svg>
                </div> : ''}
                <div className="video__title">
                  {!feed.talking ?  <Icon name="microphone slash" color="red"/> : ''}
                  <div className='title-name'>{feed.display.display}</div>
                </div>
            </div>
            <svg className={classNames('nowebcam', {'hidden': !feed.cammute && !muteOtherCams})} viewBox="0 0 32 18"
                 preserveAspectRatio="xMidYMid meet">
                <text x="16" y="9" textAnchor="middle" alignmentBaseline="central"
                      dominantBaseline="central">&#xf2bd;</text>
            </svg>
            <video
                key={"v" + i}
                ref={"remoteVideo" + i}
                id={"remoteVideo" + i}
                width={width}
                height={height}
                autoPlay={autoPlay}
                controls={controls}
                muted={true}
                playsInline={true} />
        </div>);
      });

      const remoteAudios = this.state.feeds.map((feed) => {
        const id = feed.id;
        return (<audio
                  key={'a'+id}
                  ref={'remoteAudio' + id}
                  id={'remoteAudio' + id}
                  autoPlay={autoPlay}
                  controls={controls}
                  playsInline={true} />);
      });

      const otherFeedHasQuestion = this.state.feeds.some(({question, id}) => question && id !== myid);
      const questionDisabled = !audio_device || !localAudioTrack || delay || otherFeedHasQuestion;
      const login = (<LoginPage user={user} checkPermission={this.checkPermission} />);
      const openVideoDisabled = video_device === null || !localAudioTrack || delay;
      const chatCountLabel = (<Label key='Carbon' floating size='mini' color='red'>{chatMessagesCount}</Label>);
      const content = (
        <div>
            <div className='vclient'>
                <div className="vclient__toolbar">
                  <Input iconPosition='left' action>
                      <Select className='select_room'
                              search
                              disabled={!!room}
                              error={!selected_room}
                              placeholder=" Select Room: "
                              value={selected_room}
                              text={name}
                              options={rooms_list}
                              onChange={(e, {value}) => this.selectRoom(value)} />
                      {room ? <Button size='massive' className="login-icon" negative icon='sign-out' disabled={delay} onClick={() => this.exitRoom(false)} />:""}
                      {!room ? <Button size='massive' className="login-icon" primary icon='sign-in' loading={delay} disabled={delay || !selected_room} onClick={() => this.initClient(false)} />:""}
                  </Input>
                  <Menu icon="labeled" size="massive" secondary>
                    <Modal trigger={<Menu.Item icon="setting" name={t('oldClient.settings')} position="right" />}
                           on='click'
                           closeIcon
                           className='settings'>
                      <Accordion as={Menu} vertical>
                        <Menu.Item className='settings-title'>
                          <Accordion.Title
                            active={settingsActiveIndex === 0}
                            className={classNames({'disabled': !!room})}
                            content={t('oldClient.video')}
                            index={0}
                            onClick={this.handleClick}
                          />
                        </Menu.Item>
                        {!room && settingsActiveIndex === 0 && media.video.devices.map((device, i) => (
                          <Menu.Item key={`video-${i}`}
                                     disabled={!!room}
                                     name={device.label}
                                     className={video_device === device.deviceId ? 'selected' : null}
                                     onClick={() => this.setVideoDevice(device.deviceId)} />
                        ))}
                        <Menu.Item className='settings-title'>
                          <Accordion.Title
                            active={settingsActiveIndex === 1}
                            className={classNames({'disabled': !!room})}
                            content={t('oldClient.audio')}
                            index={1}
                            onClick={this.handleClick}
                          />
                        </Menu.Item>
                        {!room && settingsActiveIndex === 1 && media.audio.devices.map((device, i) => (
                          <Menu.Item key={`audio-${i}`}
                                     disabled={!!room}
                                     name={device.label}
                                     className={audio_device === device.deviceId ? 'selected' : null}
                                     onClick={() => this.setAudioDevice(device.deviceId)} />
                        ))}
                        <Menu.Item className='settings-title'>
                          <Accordion.Title
                            active={settingsActiveIndex === 2}
                            className={classNames({'disabled': !!room})}
                            content={t('oldClient.cameraQuality')}
                            index={2}
                            onClick={this.handleClick}
                          />
                        </Menu.Item>
                        {!room && settingsActiveIndex === 2 && vsettings_list.filter((quality) => quality.mobileText).map((quality, i) => (
                          <Menu.Item key={`quality-${i}`}
                                     disabled={!!room}
                                     name={t(`oldClient.${quality.mobileText}`)}
                                     className={JSON.stringify(media.video.setting) ===
                                                JSON.stringify(quality.value) ? 'selected' : null}
                                     onClick={() => this.setVideoSize(quality.value)} />
                        ))}
                        <Menu.Item className='settings-title'>
                          <Accordion.Title
                            active={settingsActiveIndex === 3}
                            content={t('oldClient.language')}
                            index={3}
                            onClick={this.handleClick}
                          />
                        </Menu.Item>
                        {settingsActiveIndex === 3 && languagesOptions.map((language) => (
                          <Menu.Item key={`lang-${language.key}`}
                                     name={language.text}
                                     className={i18n.language === language.value ? 'selected' : null}
                                     onClick={() => setLanguage(language.value)} />
                        ))}
                        <Menu.Item className='settings-title'>
                          <Accordion.Title
                            active={settingsActiveIndex === 4}
                            index={4}
                            onClick={this.handleClick}>
                            <Icon name="user circle" />
                            <span className='name'>{user ? user.display : ''}</span>
                            <Icon name={settingsActiveIndex === 4 ? 'caret down' : 'caret left'}
                                  style={{float: 'right'}} />
                          </Accordion.Title>
                        </Menu.Item>
                        {settingsActiveIndex === 4 && <Menu.Item
                            name={t('oldClient.myAccount')}
                            onClick={() => window.open('https://accounts.kbb1.com/auth/realms/main/account')} />}
                        {settingsActiveIndex === 4 && <Menu.Item
                            name={t('oldClient.signOut')}
                            onClick={() => { kc.logout(); updateSentryUser(null); }} />}
                      </Accordion>
                    </Modal>
                  </Menu>
                </div>

                <div style={{height: '0px', zIndex: 1, position: 'sticky', top: 0}}>
                  {talking && <Label className='talk' size='massive' color='red' style={{margin: '1rem'}}>
                    <Icon name='microphone' />On</Label>}
                </div>

								<div>
								{room !== '' ?
									<VirtualStreamingMobile
										shidur={shidur}
										shidurLoading={shidurLoading}
										shidurJanus={virtualStreamingJanus}
										toggleShidur={this.toggleShidur}
										audio={this.state.virtualStreamingJanus && this.state.virtualStreamingJanus.audioElement}
                    muted={this.state.shidurMuted}
                    videos={videos}
                    setVideo={(v) => this.setState({videos: v})}
                    setMuted={(muted) => this.setShidurMuted(muted)}
									/> : null}
								</div>

                <div basic className="vclient__main">
                    <div className="vclient__main-wrapper">
                        <div className="videos-panel">
                            <div className="videos" >
                                <div className="videos__wrapper">
                                    {/* My own feed/video */}
                                    <div className="video">
                                        <div className={classNames('video__overlay')}>
                                            {question ?
                                                <div className="question">
                                                    <svg viewBox="0 0 50 50"><text x="25" y="25" textAnchor="middle" alignmentBaseline="central" dominantBaseline="central">&#xF128;</text></svg>
                                                </div>
                                                :
                                                ''
                                            }
                                            <div className="video__title">
                                                {muted ? <Icon name="microphone slash" color="red"/> : ''}
                                                <div className='title-name'>{user ? user.username : ""}</div>
                                                <Image src={connectionIcon()} style={{height: '1em', objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle', marginLeft: '0.4em'}} />
                                            </div>
                                        </div>
                                        <svg className={classNames('nowebcam',{'hidden':!cammuted})} viewBox="0 0 32 18" preserveAspectRatio="xMidYMid meet" >
                                            <text x="16" y="9" textAnchor="middle" alignmentBaseline="central" dominantBaseline="central">&#xf2bd;</text>
                                        </svg>
                                        <video
                                            className={classNames('mirror',{'hidden':cammuted})}
                                            ref="localVideo"
                                            id="localVideo"
                                            width={width}
                                            height={height}
                                            autoPlay={autoPlay}
                                            controls={controls}
                                            muted={true}
                                            playsInline={true}/>

                                    </div>
                                    {remoteVideos}
                                </div>
                            </div>
                            {remoteVideos.length > 0 ?
                              <div className="dots">
                                <Dots length={Math.ceil(userFeeds(feeds).length/PAGE_SIZE)}
                                      visible={Math.ceil(userFeeds(feeds).length/PAGE_SIZE)}
                                      active={page}
                                      margin={10} />
                              </div>
                            :""}
                            {remoteVideos.length > 0 ?
                              <div className="right-arrow" onClick={() => this.switchPage(page + 1, feeds)}>
                                        <Icon name='chevron right' color='blue' size='huge' />
                              </div>
                            :""}
                            {remoteVideos.length > 0 ?
                              <div className="left-arrow" onClick={()=> this.switchPage(page - 1, feeds)}>
                                <Icon name='chevron left' color='blue' size='huge' />
                              </div>
                            :""}
                        </div>
                        {remoteAudios}
                    </div>
                </div>
            </div>
            { !(new URL(window.location.href).searchParams.has('lost')) ? null :
                (<Label color={net_status === 2 ? 'yellow' : net_status === 3 ? 'red' : 'green'} icon='wifi' corner='right' />)}
          <div className={classNames('vclient__toolbar', 'bottom')}>
              <Menu icon='labeled' size='massive' secondary>
                  <Menu.Item disabled={!localAudioTrack} onClick={this.micMute} className="mute-button">
                      <canvas className={muted ? 'hidden' : 'vumeter'} ref="canvas1" id="canvas1" width="15" height="35" style={{zIndex: 5}} />
                      <Icon color={muted ? "red" : "green"} name={!muted ? "microphone" : "microphone slash"} style={{zIndex: 8}}/>
                      <span style={{zIndex: 8}}>
                        {t(muted ? 'oldClient.unMute' : 'oldClient.mute')}
                      </span>
                  </Menu.Item>
                  <Menu.Item disabled={openVideoDisabled} onClick={() => this.camMute(cammuted)}>
                      <Icon name={!cammuted ? "eye" : "eye slash"}
                            style={{color: openVideoDisabled ? null : (cammuted ? 'red' : 'white')}} />
                      <span>{t(cammuted ? 'oldClient.startVideo' : 'oldClient.stopVideo')}</span>
                  </Menu.Item>
                  <Menu.Item onClick={this.otherCamsMuteToggle}>
                    <Image className='audio-mode' src={muteOtherCams ? audioModeSvg : fullModeSvg} />
                    <span>{t(muteOtherCams ? 'oldClient.fullMode' : 'oldClient.audioMode')}</span>
                  </Menu.Item>
                  <Menu.Item disabled={premodStatus || questionDisabled} onClick={this.handleQuestion}>
                    <Icon name='question' style={{color: question ? '#21ba45' : null}} />
                    <span>
                      {t('oldClient.askQuestion')}
                    </span>
                  </Menu.Item>
                  <Modal
                    trigger={
                      <Menu.Item disabled={!localAudioTrack}>
                        <Icon name="comments" />
                        {t('oldClient.openChat')}
                        {chatMessagesCount > 0 ? chatCountLabel : ''}
                      </Menu.Item>
                    }
                    disabled={!localAudioTrack}
                    on='click'
                    closeIcon
                    className='chat'
                    onMount={() => this.chatMount()}
                    onUnmount={() => this.chatUnmount()}
                  >
                    <div ref={chatModal => {this.chatModal = chatModal;}}></div>
                  </Modal>
                  <Menu.Item icon='book'
                             name={t('oldClient.homerLimud')}
                             onClick={() => window.open('https://groups.google.com/forum/m/#!forum/bb-study-materials')}/>
                  <Modal
                    trigger={<Menu.Item disabled={!user || !user.id || room === ''} icon='hand paper outline' name={t('oldClient.vote')} />}
                    disabled={!user || !user.id || room === ''}
                    on='click'
                    closeIcon
                    className='vote'
                  >
                    <Button.Group>
                      <iframe src={`https://vote.kli.one/button.html?answerId=1&userId=${user && user.id}`} frameBorder="0"></iframe>
                      <iframe src={`https://vote.kli.one/button.html?answerId=2&userId=${user && user.id}`} frameBorder="0"></iframe>
                    </Button.Group>
                  </Modal>
                  <Monitoring monitoringData={monitoringData} />
              </Menu>
          </div>
          <div className='chat-wrapper' ref={chatWrapper => {this.chatWrapper = chatWrapper;}}>
            <VirtualChat
              t={t}
              ref={chat => {this.chat = chat;}}
              visible={chatVisible}
              janus={janus}
              room={room}
              user={user}
              gdm={this.state.gdm}
              onCmdMsg={this.handleCmdData}
              onNewMsg={this.onChatMessage} />
          </div>
        </div>
      );

      return (
          <Fragment>
             <MetaTags>
                <meta name="viewport" content=" user-scalable=no" />
             </MetaTags>
              {user ? content : login}
          </Fragment>
      );
  }
}

export default withTranslation()(MobileClient);
