import balance from 'utils/balance'
import { generateConstants } from 'utils/generateConstants'

import { loadWallet } from './Wallet'

export const NetworkConstants = generateConstants('NETWORK', {
  successError: [
    'CHANGE',
    'UPDATE_BALANCE',
    'FETCH_ACCOUNTS',
    'FETCH_LOCAL_WALLET',
    'SEND_FROM_NODE',
    'SEND_FROM_ACCOUNT',
    'LATEST_BLOCK'
  ],
  regular: ['SELECT_ACCOUNT', 'SET_PROVIDER', 'SET_IPFS']
})

export function init(callback) {
  return async function(dispatch, getState) {
    var state = getState()
    dispatch({ type: NetworkConstants.CHANGE })
    dispatch(loadWallet())

    var accounts = [],
      balanceWei
    var id = await web3.eth.net.getId().catch(() => {
      dispatch({
        type: NetworkConstants.CHANGE_ERROR,
        error: 'Network unavailable'
      })
      return
    })
    if (!id) {
      return
    }

    var accountsRaw = await web3.eth.getAccounts()

    for (let hash of accountsRaw) {
      balanceWei = await web3.eth.getBalance(hash)
      accounts.push({
        hash,
        balanceWei,
        balance: balance(balanceWei, state.wallet.exchangeRates)
      })
    }

    dispatch({
      type: NetworkConstants.CHANGE_SUCCESS,
      id,
      accounts
    })

    dispatch(getLatestBlock())

    if (callback) {
      callback()
    }
  }
}

export function fetchAccounts() {
  return async function(dispatch) {
    dispatch({ type: NetworkConstants.FETCH_ACCOUNTS })

    var accounts = []
    var accountsRaw = await web3.eth.getAccounts()
    for (let hash of accountsRaw) {
      var balanceWei = await web3.eth.getBalance(hash)
      accounts.push({
        hash,
        balanceWei,
        balance: web3.utils.fromWei(balanceWei, 'ether')
      })
    }

    dispatch({ type: NetworkConstants.FETCH_ACCOUNTS_SUCCESS, accounts })
  }
}

export function updateBalance(account) {
  return async function(dispatch, getState) {
    var state = getState()
    dispatch({ type: NetworkConstants.UPDATE_BALANCE })

    var balanceWei = await web3.eth.getBalance(account)

    dispatch({
      type: NetworkConstants.UPDATE_BALANCE_SUCCESS,
      account,
      balance: balance(balanceWei, state.wallet.exchangeRates)
    })
  }
}

export function getLatestBlock() {
  return async function(dispatch) {
    dispatch({ type: NetworkConstants.LATEST_BLOCK })

    var blockNumber = await web3.eth.getBlockNumber()
    var block = await web3.eth.getBlock(blockNumber)

    dispatch({
      type: NetworkConstants.LATEST_BLOCK_SUCCESS,
      block
    })
  }
}

export function sendFromNode(from, to, value) {
  return function(dispatch) {
    dispatch({ type: NetworkConstants.SEND_FROM_NODE, from, to, value })

    web3.eth
      .sendTransaction({
        from,
        to,
        value: web3.utils.toWei(value, 'ether'),
        gas: 4612388
      })
      .on('transactionHash', hash => {
        dispatch({ type: 'LOG', message: 'transactionHash', hash })
      })
      .on('receipt', receipt => {
        dispatch({ type: 'LOG', message: 'receipt', receipt })
      })
      .on('confirmation', function(num, receipt) {
        if (num === 1) {
          dispatch({ type: NetworkConstants.SEND_FROM_NODE_SUCCESS, receipt })
          dispatch(updateBalance(from))
          dispatch(updateBalance(to))
        }
      })
      .on('error', error => {
        dispatch({ type: NetworkConstants.SEND_FROM_NODE_ERROR, error })
      })
  }
}

export function sendFromAccount(from, to, value) {
  return async function(dispatch, getState) {
    var state = getState()
    var chainId = state.network.id
    var account = state.wallet.raw[from]
    var valEth = value
    if (state.wallet.currency !== 'eth') {
      valEth = String(
        Number(value) / state.wallet.exchangeRates[state.wallet.currency]
      )
    }

    dispatch({ type: NetworkConstants.SEND_FROM_ACCOUNT, from, to, value })

    var signedTx = await account.signTransaction({
      from: account.address,
      to,
      gas: 4612388,
      value: web3.utils.toWei(valEth, 'ether'),
      chainId: chainId > 10 ? 1 : chainId
    })

    web3.eth
      .sendSignedTransaction(signedTx.rawTransaction)
      .on('error', error => {
        dispatch({
          type: NetworkConstants.SEND_FROM_ACCOUNT,
          message: error.message
        })
      })
      .on('transactionHash', hash => {
        dispatch({ type: 'LOG', message: 'transactionHash', hash })
      })
      .on('receipt', receipt => {
        dispatch({ type: 'LOG', message: 'receipt', receipt })
      })
      .on('confirmation', num => {
        if (num === 1) {
          dispatch({ type: NetworkConstants.SEND_FROM_ACCOUNT_SUCCESS })
          dispatch(updateBalance(from))
          dispatch(updateBalance(to))
        }
      })
  }
}

export function setProvider(provider) {
  return async function(dispatch, getState) {
    var state = getState()
    if (state.network.provider === provider) {
      return
    }
    web3.setProvider(provider)
    dispatch({ type: NetworkConstants.SET_PROVIDER, provider })
    dispatch(init())
  }
}

export function timeTravel(seconds) {
  return async function(dispatch) {
    await new Promise(resolve =>
      web3.currentProvider.send(
        {
          method: 'evm_increaseTime',
          params: [seconds]
        },
        () => resolve()
      )
    )
    await new Promise(resolve =>
      web3.currentProvider.send({ method: 'evm_mine' }, () => resolve())
    )

    dispatch(getLatestBlock())
  }
}

export function selectAccount(hash) {
  return { type: NetworkConstants.SELECT_ACCOUNT, hash }
}
export function setIpfs(gateway, api) {
  return { type: NetworkConstants.SET_IPFS, gateway, api }
}
