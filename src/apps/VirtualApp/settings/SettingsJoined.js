import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Modal,
  Grid,
  Divider,
  Typography,
  IconButton,
  TextField,
  Tooltip,
  FormControlLabel,
  Checkbox
} from '@material-ui/core';
import { AccountCircle, Close, Computer, Mic, Videocam } from '@material-ui/icons';
import makeStyles from '@material-ui/core/styles/makeStyles';

import { vsettings_list } from '../../../shared/consts';
import { getLanguage, languagesOptions, setLanguage } from '../../../i18n/i18n';
import MyMedia from './MyMedia';
import CheckMySelf from './CheckMySelf';
import { SelectLanguage } from '../components/SelectLanguage';
import { SelectBroadcastVideo } from '../components/SelectBroadcastVideo';

const useStyles = makeStyles(() => ({
  content: {
    maxWidth: 800,
    outline: 'none'
  },
  modal: {
    backgroundColor: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none'
  }
}));

const SettingsJoined = (props) => {
  const classes = useStyles();
  const { t }   = useTranslation();

  const { audio, video, isOpen = false, closeModal, setAudio, setVideo, videos, userDisplay, audioModeChange, isAudioMode } = props;

  const audio_device = audio?.audio_device || audio?.devices[0]?.deviceId;
  const audioLabel   = audio?.devices.find(d => d.deviceId === audio_device)?.label;

  const video_device = video?.video_device || video?.devices[0]?.deviceId;
  const videoLabel   = video?.devices.find(d => d.deviceId === video_device)?.label;

  const settingsLabel = vsettings_list.find(d => JSON.stringify(video?.setting) == JSON.stringify(d.value))?.text;

  const handleAudioModeChange = () => audioModeChange();

  const renderHeader = () => (
    <>
      <Grid item xs={11}>
        <Typography variant="h5" display="block">
          {t('oldClient.settings')}
        </Typography>
      </Grid>
      <Grid item xs={1}>
        <IconButton onClick={closeModal}>
          <Close />
        </IconButton>
      </Grid>
    </>
  );

  const renderUserSettings = () => {
    const lang = getLanguage();
    return (
      <>
        <Grid item xs={4}>

          <AccountCircle style={{ fontSize: '2em' }} />
          <Typography variant="h6" display="inline" style={{ verticalAlign: 'top' }}>
            {t('settings.userSettings')}
          </Typography>
        </Grid>
        <Grid item={true} xs={4}>
          <TextField
            label={t('settings.screenName')}
            fullWidth={true}
            variant="outlined"
            value={userDisplay}
            disabled
          />
        </Grid>
        <Grid item={true} xs={4}>
          <TextField
            variant="outlined"
            fullWidth={true}
            label={t('settings.interfaceLanguage')}
            onChange={e => setLanguage(e.target.value)}
            value={lang}
            select
          >
            {
              languagesOptions.map(({ key, value, text }) => {
                return <option key={key} value={value}>{text}</option>;
              })
            }
          </TextField>
        </Grid>
      </>
    );
  };

  const renderBroadcastSettings = () => {
    return (
      <>
        <Grid item={true} xs={4}>
          <Computer style={{ fontSize: '2em' }} />
          <Typography variant="h6" display="inline" style={{ verticalAlign: 'top' }}>
            {t('settings.broadcastSettings')}
          </Typography>
        </Grid>
        <Grid item={true} xs={4}>
          <SelectBroadcastVideo videos={videos} setVideo={setVideo} />
        </Grid>
        <Grid item={true} xs={4}>
          <SelectLanguage setAudio={setAudio} />
        </Grid>
      </>
    );
  };

  const renderMediaSettings = () => {
    return (
      <>
        <Grid item xs={6}>
          <Grid container spacing={4}>
            <Grid item xs={12}>
              <Videocam style={{ fontSize: '2em' }} />
              <Typography variant="h6" display="inline" style={{ verticalAlign: 'top' }}>
                {t('settings.cameraSettings')}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Tooltip title={videoLabel} arrow>
                <TextField
                  label={t('settings.cameraSource')}
                  fullWidth={true}
                  disabled={true}
                  variant="outlined"
                  value={videoLabel}
                />
              </Tooltip>
            </Grid>
            <Grid item xs={6}>
              <Tooltip title={settingsLabel} arrow>
                <TextField
                  label={t('settings.cameraQuality')}
                  fullWidth={true}
                  variant="outlined"
                  disabled={true}
                  value={settingsLabel}
                />
              </Tooltip>
            </Grid>
            <Grid item xs={12}>
              <MyMedia video={{ stream: video.stream }} />
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={6}>
          <Grid container spacing={4}>
            <Grid item xs={12}>
              <Mic style={{ fontSize: '2em' }} />
              <Typography variant="h6" display="inline" style={{ verticalAlign: 'top' }}>
                {t('settings.microphoneSettings')}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Tooltip title={audioLabel} arrow>
                <TextField
                  label={t('settings.micSource')}
                  fullWidth={true}
                  variant="outlined"
                  disabled={true}
                  value={audioLabel}
                />
              </Tooltip>
            </Grid>
            <Grid item xs={12}>
              <CheckMySelf />
            </Grid>
          </Grid>
        </Grid>
      </>
    );
  };

  const renderContent = () => {
    return (
      <Grid container spacing={4} className={classes.content}>
        {renderHeader()}
        <Divider variant="fullWidth" style={{ width: '100%' }} />
        {renderUserSettings()}
        <Divider variant="fullWidth" style={{ width: '100%' }} />
        {renderBroadcastSettings()}
        <Divider variant="fullWidth" style={{ width: '100%' }} />
        {renderMediaSettings()}

        <Grid item xs={12}>
          <FormControlLabel
            label={t('oldClient.audioMode')}
            control={
              <Checkbox
                checked={!!isAudioMode}
                onChange={handleAudioModeChange}
                name="isAudioMode"
              />
            }
          />
        </Grid>
      </Grid>
    );
  };

  return (
    <Modal
      open={isOpen}
      disableBackdropClick={true}
      BackdropProps={{
        style: { backgroundColor: 'white' }
      }}
      className={classes.modal}
    >
      {renderContent()}
    </Modal>
  );
};

export default memo(SettingsJoined, ((prevProps, nextProps) => {
  const { videoLength, isOpen, videos, userDisplay } = prevProps;
  return (
    videoLength === nextProps.videoLength
    && videos === nextProps.videos
    && userDisplay === nextProps.userDisplay
    && isOpen === nextProps.isOpen
  );
}));