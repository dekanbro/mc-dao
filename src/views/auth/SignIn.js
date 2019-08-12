import React, { useContext, useState } from 'react';
import { Link, withRouter } from 'react-router-dom';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import { Auth, Storage } from 'aws-amplify';
import shortid from 'shortid';

import {
  SdkEnvironmentNames,
  getSdkEnvironment,
  createSdk,
} from '@archanova/sdk';

import config from '../../config';

import { CurrentUserContext } from '../../contexts/Store';
import Loading from '../../components/shared/Loading';

const sdkEnv = getSdkEnvironment(SdkEnvironmentNames[`${config.SDK_ENV}`]); // kovan env by default

const SignIn = ({ history }) => {
  const [, setCurrentUser] = useContext(CurrentUserContext);
  const [authError, setAuthError] = useState();

  return (
    <div>
      <h2 className="Pad">Sign in to existing account</h2>
      <Formik
        initialValues={{ username: '', password: '' }}
        validate={(values) => {
          let errors = {};
          if (!values.username) {
            errors.username = 'Required';
          }
          if (!values.username) {
            errors.password = 'Required';
          }

          return errors;
        }}
        onSubmit={async (values, { setSubmitting }) => {
          try {
            const user = await Auth.signIn({
              username: values.username,
              password: values.password,
            });

            const sdk = new createSdk(
              sdkEnv.setConfig('storageAdapter', localStorage),
            );
            // account address is set to 0x0 on signup
            // update this value after sdk is initialized and created
            // if account address exists on aws but connect account to sdk
            if (user.attributes['custom:account_address'] !== '0x0') {
              try {
                await sdk.initialize();
                await sdk.connectAccount(
                  user.attributes['custom:account_address'],
                );
                //currentUserInfo returns the correct attributes
                const attributes = await Auth.currentUserInfo();
                const realuser = {
                  ...user,
                  ...{ attributes: attributes.attributes },
                };
                setCurrentUser({ ...realuser, ...{ sdk } });
                setSubmitting(false);
                history.push('/proposals');
              } catch (err) {
                console.log(err); // {"error":"account device not found"}
              }
            } else {
              await sdk.initialize();
              const uuid = shortid.generate();
              const ensLabel = `${encodeURI(user.username)}-${uuid}`;
              const account = await sdk.createAccount(ensLabel);
              const accountDevices = await sdk.getConnectedAccountDevices();

              await Auth.updateUserAttributes(user, {
                'custom:account_address': account.address,
                'custom:device_address': accountDevices.items[0].device.address,
                'custom:ens_name': ensLabel,
              });
              const jsonse = JSON.stringify(
                {
                  username: user.username,
                  deviceId: accountDevices.items[0].device.address,
                },
                null,
                2,
              );
              const blob = new Blob([jsonse], {
                type: 'application/json',
              });
              try {
                // save user meta to S3
                Storage.put(
                  `member_${account.address.toUpperCase()}.json`,
                  blob,
                  {
                    contentType: 'text/json',
                  },
                );
              } catch (err) {
                console.log('storage error', err);
              }

              const attributes = await Auth.currentUserInfo();
              const realuser = {
                ...user,
                ...{ attributes: attributes.attributes },
              };
              setCurrentUser({ ...realuser, ...{ sdk } });

              setSubmitting(false);
              history.push('/proposals');
            }
          } catch (err) {
            setAuthError(err);
            setSubmitting(false);
            console.log('error signing in: ', err);
          }
        }}
      >
        {({ isSubmitting }) => {
          if (isSubmitting) {
            return <Loading />;
          }

          return (
            <Form className="Form">
              {authError ? (
                <div className="Form__auth-error">{authError.message}</div>
              ) : null}
              <Field name="username">
              {({ field, form }) => (
                <div
                  className={
                    field.value
                      ? 'Field HasValue'
                      : 'Field '
                  }
                >
                  <label>Pseudonym</label>
                  <input type="text" {...field} />
                </div>
              )}
              </Field>
                <ErrorMessage name="username" render={msg => <div className="Error">{msg}</div>} />
              <Field type="password" name="password">
              {({ field, form }) => (
                <div
                  className={
                    field.value
                      ? 'Field HasValue'
                      : 'Field '
                  }
                >
                  <label>Password</label>
                  <input type="password" {...field} />
                </div>
              )}
              </Field>
              <ErrorMessage name="password" render={msg => <div className="Error">{msg}</div>} />
              <button type="submit" disabled={isSubmitting}>
                Sign In
              </button>
            </Form>
          );
        }}
      </Formik>
      <Link className="AltOption" to="/sign-up">
        Create a new account
      </Link>
    </div>
  );
};

export default withRouter(SignIn);
