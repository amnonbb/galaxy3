import React from 'react';
import { Mic, MicOff } from '@material-ui/icons';
import { Tooltip, IconButton, Box } from '@material-ui/core';

const Mute = React.forwardRef((props, ref) => {
  const { action, isOn, disabled, t } = props;
  const handleAction                  = () => action(isOn);

  return (
    <Box>
      <canvas className={disabled ? 'hidden' : 'vumeter'} ref={ref} id="canvas1" width="10" height="35" />
      <Tooltip title={t(isOn ? 'oldClient.unMute' : 'oldClient.mute')}>
        <IconButton
          aria-label={t(isOn ? 'oldClient.unMute' : 'oldClient.mute')}
          disabled={disabled}
          onClick={() => handleAction()}>
          {isOn ? <MicOff color="secondary" /> : <Mic />}
        </IconButton>
      </Tooltip>
    </Box>
  );
});

export { Mute };
export default Mute;
