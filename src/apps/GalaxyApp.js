import React, {Component, Fragment,} from 'react';
import {Button, Divider, Grid,} from "semantic-ui-react";
import LoginPage from '../components/LoginPage';
import {kc} from "../components/UserManager";
import {withTranslation} from "react-i18next";
import {languagesOptions, setLanguage} from "../i18n/i18n";
import VerifyAccount from './VirtualApp/components/VerifyAccount';

class GalaxyApp extends Component {

    state = {
        user: null,
        roles: [],
        options: 0,
    };

    componentDidMount() {
        const url = new URL(window.location.href);
        if (url.searchParams.has('lang')) {
            const lang = url.searchParams.get('lang');
            if (languagesOptions.find((option) => option.value === lang) !== null) {
                setLanguage(lang);
                url.searchParams.delete('lang');
                window.history.pushState({}, document.title, url.href);
            }
        }
    }

    checkPermission = (user) => {
        const approval = kc.hasRealmRole("pending_approval");
        const options = this.options(user.roles, approval);
        this.setState({options: options.length});
        user.role = approval ? 'ghost' : 'user';
        const requested = this.requested(user);
        if(options.length > 1 || (approval && !requested)) {
            this.setState({user, roles: user.roles});
        } else if(requested || options.length === 1) {
            window.location = '/user';
        } else {
            alert("Access denied.");
            kc.logout();
        }
    }

    requested = (user) => {
        return user && !!user.request && !!user.request.length;
    }

    options = (roles, approval) => {
        const {t} = this.props;
        return roles.map((role, i) => {
            if(role === "gxy_user" || role === "pending_approval") {
                return (<Button key={i} size='massive' color='green' onClick={() => window.open("user","_self")}>
                    {approval ? t('galaxyApp.continueAsGuest') : 'Galaxy'}
                </Button>);
            }
            if(role === "gxy_shidur") {
                return (<Button key={i} size='massive' color='green' onClick={() => window.open("shidur","_self")}>
                    Shidur
                </Button>);
            }
            if(role === "gxy_sndman") {
                return (<Button key={i} size='massive' color='green' onClick={() => window.open("sndman","_self")}>
                    SoundMan
                </Button>);
            }
            if(role.match(/^(gxy_admin|gxy_root|gxy_viewer)$/)) {
                return (<Button key={i} size='massive' color='green' onClick={() => window.open("admin","_self")}>
                    Admin
                </Button>);
            }
            return false;
        }).filter(element => element);
    }

    render() {
        const {i18n} = this.props;
        const {user, roles, options} = this.state;
        const approval = kc.hasRealmRole("pending_approval");
        const requested = this.requested(user);

        const enter = (
            <Grid columns={(!approval || requested) ? 1 : 2}>
                <Grid.Row>
                    {user && options > 1 ? null : <Divider className="whole-divider" vertical />}
                    {(!approval || requested) ? null :
                        <Grid.Column>
                        <VerifyAccount user={user} loginPage={true} i18n={i18n} onUserUpdate={(user) => this.checkPermission(user)} />
                    </Grid.Column>}
                    <Grid.Column style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                        {this.options(roles, approval)}
                    </Grid.Column>
                </Grid.Row>
            </Grid>
        );

        return (
            <Fragment>
                <LoginPage user={user} enter={enter} checkPermission={this.checkPermission} />
            </Fragment>
        );
    }
}

export default withTranslation()(GalaxyApp);
